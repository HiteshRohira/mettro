import { codeForName, edgeBetween, LINES, stationByCode, titleTowards, type Line } from '@/lib/network';
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
  return list.length;
}

const pad = (n: number) => String(n).padStart(2, '0');
function isoLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00.000`;
}

function hms(s?: string | null) {
  if (!s) return 0;
  const [h, m, sec] = s.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
}

function lineFor(lineNo: number | undefined, a: string, b: string): Line | undefined {
  const e = edgeBetween(a, b);
  if (e) return LINES.find((l) => l.id === e.line);
  return LINES.find((l) => l.num === lineNo);
}

export type ApiMode = 'least-distance' | 'minimum-interchange';

export async function planOnline(from: string, to: string, when: Date, mode: ApiMode): Promise<Journey> {
  const r = await get<any>(`station_route/${from}/${to}/${mode}/${isoLocal(when)}`, 15000);
  if (!r || r.status === false || !Array.isArray(r.route)) throw new Error(r?.['Error Message'] || 'No route');
  const legs: Leg[] = [];
  let km = 0;
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
    // scale per-hop seconds to match the planner's leg time
    const sum = hopS.reduce((a, b) => a + b, 0) || 1;
    const segS = hopS.map((s) => Math.round((s * total) / sum));
    legs.push({
      lineId: line.id,
      stations: codes,
      towards: seg.towards_station ? titleTowards(seg.towards_station) : towardsFor(line.id, codes[0], codes[1]),
      platform: seg.platform_name ?? null,
      depart: seg.new_start_time ?? null,
      arrive: seg.new_end_time ?? null,
      durationS: total || segS.reduce((a, b) => a + b, 0),
      segS,
    });
  }
  if (!legs.length) throw new Error('No route');
  const stops = legs.reduce((a, l) => a + l.stations.length - 1, 0);
  const est = estimateFare(legs, km);
  const sunday = when.getDay() === 0;
  return {
    id: `dmrc-${mode}-${from}-${to}-${legs.map((l) => l.lineId).join('.')}`,
    from,
    to,
    legs,
    totalS: (() => {
      const d = legs[0].depart ? hms(legs[0].depart) : 0;
      const a = legs[legs.length - 1].arrive ? hms(legs[legs.length - 1].arrive) : 0;
      if (d && a) return a >= d ? a - d : a + 86400 - d;
      return hms(r.total_time);
    })(),
    stops,
    interchanges: legs.length - 1,
    fare: typeof r.fare === 'number' ? r.fare : est.normal,
    fareSunday: sunday ? (typeof r.fare === 'number' ? r.fare : est.sunday) : est.sunday,
    fareSource: typeof r.fare === 'number' ? 'dmrc' : 'estimate',
    source: 'dmrc',
    mode: mode === 'least-distance' ? 'fastest' : 'fewest-changes',
    queriedAt: Date.now(),
    km,
  };
}
