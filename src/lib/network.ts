import raw from '@/data/delhi/network.json';

export type Line = {
  id: string;
  num: number;
  name: string;
  color_name: string;
  color: string;
  tint: string;
  start: string;
  end: string;
  status: string;
  stations: string[];
  branches: string[][];
  edges: [string, string][];
  start_code: string | null;
  end_code: string | null;
};

export type Station = {
  code: string;
  name: string;
  raw: string;
  lat: number;
  lng: number;
  type: string;
  lines: string[];
  tags: string[];
  open: string;
  close: string;
  interchange: boolean;
};

/** `oneway`: trains only run a -> b (Rapid Metro loop). */
export type Edge = { a: string; b: string; line: string; km: number; s: number; oneway?: number };

export type DirTiming = {
  line: string;
  to: string | null;
  platform: string | null;
  first: string | null;
  last: string | null;
};

type Network = {
  city: string;
  generated: string | null;
  lines: Line[];
  stations: Station[];
  edges: Edge[];
  firstLast: Record<string, DirTiming>; // key "FROM|NEIGHBOUR"
};

const net = raw as unknown as Network;

export const LINES: Line[] = net.lines;
export const STATIONS: Station[] = net.stations;
export const EDGES: Edge[] = net.edges;
export const DIR_TIMINGS = net.firstLast;
export const DATA_GENERATED = net.generated;

export const lineById = new Map(LINES.map((l) => [l.id, l]));
export const stationByCode = new Map(STATIONS.map((s) => [s.code, s]));

export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const byRawName = new Map<string, string>();
for (const s of STATIONS) {
  byRawName.set(normName(s.raw), s.code);
  byRawName.set(normName(s.name), s.code);
}
const OLD_NAMES: Record<string, string> = {
  udyogbhawan: 'UDB',
  rohiniwest: 'RHW',
  pitampura: 'PTP',
  rohinieast: 'RHE',
  jagatpurvillage: 'JPVE',
  dwarka: 'DW',
};
export function codeForName(name: string): string | undefined {
  const n = normName(name);
  return byRawName.get(n) ?? (OLD_NAMES[n] && stationByCode.has(OLD_NAMES[n]) ? OLD_NAMES[n] : undefined);
}

export function getStation(code: string): Station {
  const s = stationByCode.get(code);
  if (!s) throw new Error(`Unknown station ${code}`);
  return s;
}
export function getLine(id: string): Line {
  const l = lineById.get(id);
  if (!l) throw new Error(`Unknown line ${id}`);
  return l;
}

/** Line display label, e.g. "Yellow Line", "Pink Line (Ext.)" */
export function lineLabel(l: Line): string {
  if (l.id === 'LN10') return 'Airport Express';
  if (l.id === 'LN11') return 'Rapid Metro';
  if (l.id === 'LN7EXTN') return 'Pink Line Ext.';
  if (l.id === 'LN8EXTN') return 'Magenta Line Ext.';
  return l.color_name;
}
export function lineShort(l: Line): string {
  if (l.id === 'LN10') return 'Airport';
  if (l.id === 'LN11') return 'Rapid';
  return l.color_name.replace(' Line', '').replace(' (Ext.)', '');
}

/** Colour used for text on top of a line colour chip */
export function onLineColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.68 ? '#1A1A1A' : '#FFFFFF';
}

export function linesOf(s: Station): Line[] {
  return s.lines.map((id) => lineById.get(id)).filter(Boolean) as Line[];
}

/** Unique colours for a station (Blue LN3/LN4 share a colour). */
export function stationColors(s: Station): string[] {
  return [...new Set(linesOf(s).map((l) => l.color))];
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestStations(lat: number, lng: number, n = 5) {
  return STATIONS.map((s) => ({ station: s, km: haversineKm(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

const ALIASES: Record<string, string[]> = {
  RCK: ['cp', 'connaught place'],
  NDI: ['ndls', 'new delhi railway station', 'nds'],
  KG: ['isbt kashmere gate'],
  HKMI: ['hazrat nizamuddin'],
  APOT: ['t3', 'terminal 3', 'igi airport', 'airport'],
  INA: ['ina', 'dilli haat'],
  HCC: ['huda city centre', 'gurgaon'],
  CHK: ['chandni chowk', 'old delhi'],
  AVIT: ['anand vihar'],
  DACY: ['aerocity'],
};

export function searchStations(q: string, limit = 40): Station[] {
  const query = q.trim().toLowerCase();
  if (!query) return STATIONS.slice(0, limit);
  const nq = normName(query);
  const scored: { s: Station; score: number }[] = [];
  for (const s of STATIONS) {
    const name = s.name.toLowerCase();
    const nn = normName(s.name);
    let score = -1;
    if (nn === nq || s.code.toLowerCase() === query) score = 100;
    else if (nn.startsWith(nq)) score = 80;
    else if (name.split(/[\s\-()]+/).some((w) => w.startsWith(query))) score = 60;
    else if (nn.includes(nq)) score = 40;
    const al = ALIASES[s.code];
    if (al?.some((a) => normName(a).startsWith(nq) || normName(a) === nq)) score = Math.max(score, 70);
    if (score < 0 && nq.length >= 3) {
      // subsequence fuzzy match
      let i = 0;
      for (const ch of nn) if (ch === nq[i]) i++;
      if (i === nq.length) score = 10;
    }
    if (score >= 0) scored.push({ s, score: score + (s.interchange ? 2 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s);
}

/** Neighbours of a station on a line */
const neighbours = new Map<string, { code: string; line: string; s: number; km: number }[]>();
for (const e of EDGES) {
  if (!neighbours.has(e.a)) neighbours.set(e.a, []);
  if (!neighbours.has(e.b)) neighbours.set(e.b, []);
  neighbours.get(e.a)!.push({ code: e.b, line: e.line, s: e.s, km: e.km });
  if (!e.oneway) neighbours.get(e.b)!.push({ code: e.a, line: e.line, s: e.s, km: e.km });
}
export function neighboursOf(code: string) {
  return neighbours.get(code) ?? [];
}

export function edgeBetween(a: string, b: string) {
  return neighboursOf(a).find((n) => n.code === b);
}

/** All lines that run directly a -> b (some stretches are shared, e.g. Anand Vihar–Karkarduma). */
export function linesBetween(a: string, b: string) {
  return neighboursOf(a)
    .filter((n) => n.code === b)
    .map((n) => n.line);
}

/** All direction timings for a station: one per neighbour. */
export function directionsAt(code: string) {
  return neighboursOf(code)
    .map((n) => ({ neighbour: n.code, line: n.line, timing: DIR_TIMINGS[`${code}|${n.code}`] }))
    .filter((d) => d.timing);
}

export function titleTowards(name: string | null | undefined) {
  if (!name) return '';
  const code = codeForName(name);
  return code ? getStation(code).name : name;
}
