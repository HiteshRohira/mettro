import { codeForName, edgeBetween, lineById, LINES, linesBetween, stationByCode, titleTowards, type Line } from '@/lib/network';
import { hmsToSeconds, istDay, istIso } from '@/lib/time';
import { estimateFare } from '@/lib/fare';
import type { Journey, Leg } from '@/lib/router';
import { towardsFor } from '@/lib/router';

const BASE = 'https://backend.delhimetrorail.com/api/v2/en';
const HEADERS = {
  Accept: 'application/json',
  Referer: 'https://www.delhimetrorail.com/',
  Origin: 'https://www.delhimetrorail.com',
};

async function get<T>(path: string, timeoutMs = 12000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${path}`, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) throw new Error(`DMRC ${res.status}`);
    const text = await res.text();
    if (text.trimStart().startsWith('<')) throw new Error('DMRC returned HTML (blocked)');
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(t);
  }
}

export type LineStatus = { id: string; status: string; name: string };

export async function fetchLineStatuses(): Promise<LineStatus[]> {
  const raw = await get<any[]>('line_list');
  return raw
    .filter((l) => l.show_in_frontend !== false)
    .map((l) => ({ id: l.line_code as string, status: String(l.status ?? 'Unknown'), name: l.line_color as string }));
}

export async function fetchServiceInformation(): Promise<string> {
  const r = await get<unknown>('service_information');
  return typeof r === 'string' ? r : JSON.stringify(r);
}

export type StationLive = {
  status: { title?: string; note?: string; status?: string }[];
  gates: { name: string; open: boolean }[];
  open?: string;
  close?: string;
};

export async function fetchStationLive(code: string): Promise<StationLive> {
  const d = await get<any>(`station/${encodeURIComponent(code)}`);
  return {
    status: Array.isArray(d.station_status) ? d.station_status : [],
    gates: (d.gates ?? []).map((g: any) => ({ name: String(g.gate_name).trim(), open: String(g.status ?? 'open').toLowerCase() === 'open' })),
    open: d.opening_time?.slice(0, 5),
    close: d.closing_time?.slice(0, 5),
  };
}

export async function fetchStationCount(): Promise<number> {
  const list = await get<any[]>('station_list');
  // the list includes depot pseudo-stations such as "SPBI-Badli Dipo"
  return list.filter((s) => !/\s/.test(String(s.station_code ?? '')) && !/dipo|depot/i.test(String(s.station_name ?? ''))).length;
}

function hms(s?: string | null) {
  return s ? hmsToSeconds(s) : 0;
}

/** Seconds on the service-day scale (00:00–02:59 → 24:00–26:59) so times compare across midnight. */
function serviceSeconds(s: string) {
  const sec = hmsToSeconds(s);
  return sec < 3 * 3600 ? sec + 24 * 3600 : sec;
}

/** Thrown when DMRC answers but has no train for this trip at this time (e.g. after the last train). */
export class NoServiceError extends Error {
  constructor(message = 'No trains at this time') {
    super(message);
    this.name = 'NoServiceError';
  }
}

function lineFor(lineNo: number | undefined, a: string, b: string): Line | undefined {
  const candidates = linesBetween(a, b);
  // Shared stretches (Anand Vihar–Karkarduma is Blue *and* Pink): DMRC's line_no decides.
  const byNum = candidates.find((id) => lineById.get(id)?.num === lineNo);
  const id = byNum ?? candidates[0];
  if (id) return lineById.get(id);
  return LINES.find((l) => l.num === lineNo);
}

export type ApiMode = 'least-distance' | 'minimum-interchange';

export async function planOnline(from: string, to: string, when: Date, mode: ApiMode): Promise<Journey> {
  const r = await get<any>(`station_route/${from}/${to}/${mode}/${istIso(when.getTime())}`, 15000);
  if (r && r.status === false && /no path/i.test(String(r['Error Message'] ?? ''))) throw new NoServiceError();
  if (!r || r.status === false || !Array.isArray(r.route)) throw new Error(r?.['Error Message'] || 'No route');
  const legs: Leg[] = [];
  let km = 0;
  let interchangeS = 0;
  for (const seg of r.route) {
    // Prefer station codes from map-path ("RI-RHW"); names in `path` can be outdated.
    let codes: string[] = [];
    const mp: string[] = Array.isArray(seg['map-path']) ? seg['map-path'] : [];
    if (mp.length && mp.every((x) => x.split('-').length === 2)) {
      codes = [mp[0].split('-')[0], ...mp.map((x) => x.split('-')[1])];
    }
    if (!codes.length || codes.some((c) => !stationByCode.has(c))) {
      codes = [];
      for (const p of seg.path ?? []) {
        const c = codeForName(p.name);
        if (!c) throw new Error(`Unknown station in route: ${p.name}`);
        codes.push(c);
      }
    }
    if (codes.length < 2) continue;
    const line = lineFor(seg.line_no, codes[0], codes[1]);
    if (!line) throw new Error(`Unknown line ${seg.line}`);
    const total = hms(seg.path_time);
    const hopKm: number[] = [];
    const hopS: number[] = [];
    for (let i = 0; i < codes.length - 1; i++) {
      const e = edgeBetween(codes[i], codes[i + 1]);
      hopKm.push(e?.km ?? 1.2);
      hopS.push(e?.s ?? 120);
    }
    km += hopKm.reduce((a, b) => a + b, 0);
    if (legs.length) interchangeS += (Number(seg.station_interchange_time) || 5) * 60;
    // scale per-hop seconds to match the planner's leg time
    const sum = hopS.reduce((a, b) => a + b, 0) || 1;
    const segS = hopS.map((s) => Math.round((s * (total || sum)) / sum));
    legs.push({
      lineId: line.id,
      stations: codes,
      towards: seg.towards_station ? titleTowards(seg.towards_station) : towardsFor(line.id, codes[0], codes[1]),
      platform: seg.platform_name || null,
      depart: seg.new_start_time ?? null,
      arrive: seg.new_end_time ?? null,
      durationS: total || segS.reduce((a, b) => a + b, 0),
      segS,
    });
  }
  if (!legs.length) throw new Error('No route');

  // Sanity-check the planner's clock times: each leg must end after it starts and connections
  // must not go back in time. Bad times (seen live, e.g. arrival before departure) are dropped
  // so the app falls back to durations instead of showing a 23-hour journey.
  const timed = legs.every((l) => l.depart && l.arrive);
  let clockOk = timed;
  if (timed) {
    let prev = -1;
    for (const l of legs) {
      const d = serviceSeconds(l.depart!);
      const a = serviceSeconds(l.arrive!);
      if (a < d || d < prev || a - d > 3 * 3600) clockOk = false;
      prev = a;
    }
  }
  if (timed && !clockOk) legs.forEach((l) => (l.arrive = null));
  const durationOnly = legs.reduce((a, l) => a + l.durationS, 0) + interchangeS;
  const totalS = clockOk ? serviceSeconds(legs[legs.length - 1].arrive!) - serviceSeconds(legs[0].depart!) : durationOnly;

  const stops = legs.reduce((a, l) => a + l.stations.length - 1, 0);
  const est = estimateFare(legs, km);
  const planner = typeof r.fare === 'number' ? (r.fare as number) : null;
  return {
    id: `dmrc-${mode}-${from}-${to}-${legs.map((l) => l.lineId).join('.')}`,
    from,
    to,
    legs,
    totalS,
    stops,
    interchanges: legs.length - 1,
    // the planner prices the queried date (Sunday table on Sundays)
    fare: planner ?? (istDay(when.getTime()) === 0 ? est.sunday : est.normal),
    fareSunday: est.sunday,
    fareSource: planner != null ? 'dmrc' : 'estimate',
    source: 'dmrc',
    mode: mode === 'least-distance' ? 'fastest' : 'fewest-changes',
    queriedAt: Date.now(),
    km,
  };
}
