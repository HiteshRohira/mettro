import type { Leg } from '@/lib/router';

/**
 * DMRC distance-based token fares (revised 25 Aug 2025).
 * Distance slabs in km → fare (₹). Sundays & national holidays use the lower slab table.
 * Used only as an offline fallback — the DMRC journey planner fare is shown when online.
 */
export const FARE_SLABS: { upTo: number; normal: number; sunday: number; label: string }[] = [
  { upTo: 2, normal: 11, sunday: 11, label: '0 – 2 km' },
  { upTo: 5, normal: 21, sunday: 11, label: '2 – 5 km' },
  { upTo: 12, normal: 32, sunday: 21, label: '5 – 12 km' },
  { upTo: 21, normal: 43, sunday: 32, label: '12 – 21 km' },
  { upTo: 32, normal: 54, sunday: 43, label: '21 – 32 km' },
  { upTo: Infinity, normal: 64, sunday: 54, label: 'More than 32 km' },
];

const TRACK_FACTOR = 1.0; // calibrated against the DMRC planner

export function estimateFare(legs: Leg[], straightKm: number) {
  const km = straightKm * TRACK_FACTOR;
  const usesAirport = legs.some((l) => l.lineId === 'LN10');
  const usesRapid = legs.some((l) => l.lineId === 'LN11');
  const slab = FARE_SLABS.find((s) => km <= s.upTo)!;
  let normal = slab.normal;
  let sunday = slab.sunday;
  if (usesAirport || usesRapid) {
    // Airport Express & Rapid Metro have separate fare tables; the planner value is authoritative.
    return { normal: null as number | null, sunday: null as number | null, km };
  }
  return { normal, sunday, km };
}

export function isSundayFareDay(d = new Date()) {
  return d.getDay() === 0;
}
