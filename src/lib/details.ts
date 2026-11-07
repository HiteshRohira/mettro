export type StationDetails = {
  desc: string;
  mobile: string;
  landline: string;
  gates: { name: string; loc: string; divyang: boolean; open: boolean }[];
  lifts: { type: string; name: string; loc: string; divyang: boolean; ok: boolean; side: string }[];
  platforms: { name: string; to: string | null; to2: string | null }[];
  facilities: { kind: string; items: { name: string; loc: string; gate: string }[] }[];
  parking: { by: string; car: number; bike: number; cycle: number; loc: string }[];
  nearby: { group: string; cat: string; name: string; km: number | null; walk: number | null; gate: string }[];
  feeder: Record<string, string | number | boolean | null>[];
  status: { title?: string; note?: string; status?: string }[];
};

let cache: Record<string, StationDetails> | null = null;

export function getDetails(code: string): StationDetails | null {
  if (!cache) cache = require('@/data/delhi/details.json') as Record<string, StationDetails>;
  return cache[code] ?? null;
}
