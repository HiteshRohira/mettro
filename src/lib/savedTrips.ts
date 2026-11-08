import { getStation, haversineKm } from '@/lib/network';

/** A saved route between two stations. Direction is decided when it's opened. */
export type SavedTrip = {
  id: string;
  /** Stations in the order they were first saved. */
  a: string;
  b: string;
  /** Custom name; null shows the default "A – B". */
  title: string | null;
  /** Station the trip was last taken from, used when you're near neither end. */
  lastFrom: string;
  usedAt: number;
};

export type Coords = { lat: number; lng: number };

/** Within this distance of a station, that station is where you're starting from. */
export const NEAR_KM = 1;

export const pairId = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

export function distanceKm(code: string, at: Coords) {
  const s = getStation(code);
  return haversineKm(at.lat, at.lng, s.lat, s.lng);
}

/** From/to for a trip: the end you're within 1 km of, else the way you last took it. */
export function orient(t: SavedTrip, at: Coords | null): { from: string; to: string; near: boolean } {
  if (at) {
    const da = distanceKm(t.a, at);
    const db = distanceKm(t.b, at);
    if (Math.min(da, db) <= NEAR_KM) return da <= db ? { from: t.a, to: t.b, near: true } : { from: t.b, to: t.a, near: true };
  }
  return t.lastFrom === t.b ? { from: t.b, to: t.a, near: false } : { from: t.a, to: t.b, near: false };
}

export function tripTitle(t: SavedTrip, from = t.a) {
  if (t.title?.trim()) return t.title.trim();
  const to = from === t.a ? t.b : t.a;
  return `${getStation(from).name} – ${getStation(to).name}`;
}

/** Trips with an end near you first, then most recently used. */
export function rankTrips(trips: SavedTrip[], at: Coords | null) {
  return trips
    .map((t) => ({ trip: t, ...orient(t, at) }))
    .sort((x, y) => Number(y.near) - Number(x.near) || y.trip.usedAt - x.trip.usedAt);
}
