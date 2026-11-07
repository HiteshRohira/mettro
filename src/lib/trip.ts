import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { after } from 'expo-widgets';

import { getLine, getStation, lineLabel, onLineColor } from '@/lib/network';
import { INTERCHANGE_SECONDS, type Journey } from '@/lib/router';
import { useSettings } from '@/store/settings';
import { useTrip, type Fix, type Trip } from '@/store/trip';
import TripActivity, { type TripActivityProps } from '@/widgets/TripActivity';

export const TRIP_LOCATION_TASK = 'mettro-trip-location';

export type TimelinePoint = {
  code: string;
  legIndex: number;
  at: number; // planned epoch ms (without delay)
  transfer: boolean; // you change trains here
};

function clockToday(hms: string, ref: number) {
  const [h, m, s] = hms.split(':').map(Number);
  const d = new Date(ref);
  d.setHours(h || 0, m || 0, s || 0, 0);
  // planner times are for the queried day; handle past-midnight wrap
  if (d.getTime() < ref - 6 * 3600 * 1000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Absolute timeline. Uses planner departure/arrival when available, else segment estimates. */
export function buildTimeline(j: Journey, startedAt: number): TimelinePoint[] {
  const pts: TimelinePoint[] = [];
  const useClock = j.legs.every((l) => l.depart && l.arrive);
  const firstDep = useClock ? clockToday(j.legs[0].depart!, startedAt) : startedAt;
  const shift = startedAt - firstDep; // if user starts later/earlier than planned
  let t = startedAt;
  j.legs.forEach((leg, li) => {
    let legStart: number;
    let legEnd: number | null = null;
    if (useClock) {
      legStart = clockToday(leg.depart!, firstDep) + shift;
      legEnd = clockToday(leg.arrive!, firstDep) + shift;
      if (legEnd < legStart) legEnd = legStart + leg.durationS * 1000;
    } else {
      legStart = li === 0 ? t : t + INTERCHANGE_SECONDS * 1000;
    }
    const total = leg.segS.reduce((a, b) => a + b, 0) || 1;
    const span = legEnd !== null ? legEnd - legStart : total * 1000;
    let acc = 0;
    leg.stations.forEach((code, si) => {
      if (si > 0) acc += leg.segS[si - 1];
      const at = legStart + (acc / total) * span;
      if (si === 0 && li > 0) {
        pts[pts.length - 1].transfer = true;
        return;
      }
      pts.push({ code, legIndex: li, at, transfer: false });
    });
    t = legStart + span;
  });
  return pts;
}

export type Progress = {
  pts: TimelinePoint[];
  idx: number;
  current: TimelinePoint;
  next: TimelinePoint | null;
  nextAt: number;
  eta: number;
  stopsLeft: number;
  progress: number;
  phase: TripActivityProps['phase'];
  action: string;
  legIndex: number;
};

function legAfterTransfer(j: Journey, pts: TimelinePoint[], i: number) {
  // transfer point i belongs to leg L, next leg is L+1
  return j.legs[pts[i].legIndex + 1];
}

export function computeProgress(trip: Trip, now = Date.now()): Progress {
  const j = trip.journey;
  const pts = buildTimeline(j, trip.startedAt);
  const last = pts.length - 1;
  // GPS is the source of truth: every good fix rewrites `delayMs` so the timeline passes
  // through where GPS put us. Between fixes (e.g. underground) the clock carries that
  // offset forward on the timetable until GPS returns.
  let idx = 0;
  for (let i = 0; i < pts.length; i++) if (pts[i].at + trip.delayMs <= now) idx = i;
  const current = pts[idx];
  const next = idx < last ? pts[idx + 1] : null;
  const eta = pts[last].at + trip.delayMs;
  const nextAt = next ? next.at + trip.delayMs : eta;
  const startAt = pts[0].at + trip.delayMs;
  const progress = Math.min(1, Math.max(0, (now - startAt) / Math.max(1, eta - startAt)));
  const legIndex = next ? next.legIndex : current.legIndex;
  let phase: Progress['phase'] = 'riding';
  let action = `Get off at ${getStation(j.to).name}`;
  if (idx === last) {
    phase = 'arrived';
    action = 'You have arrived';
  } else if (current.transfer) {
    const nl = legAfterTransfer(j, pts, idx);
    phase = 'transfer';
    action = `Change here: ${lineLabel(getLine(nl.lineId))} → ${nl.towards}${nl.platform ? ' · ' + nl.platform.replace('Platform No.', 'P') : ''}`;
  } else if (next?.transfer) {
    const nl = legAfterTransfer(j, pts, idx + 1);
    phase = 'transfer';
    action = `Change at ${getStation(next.code).name} for ${lineLabel(getLine(nl.lineId))}`;
  } else if (next && idx + 1 === last) {
    phase = 'arriving';
    action = `Get off at ${getStation(next.code).name}`;
  } else {
    // upcoming transfer further down the line?
    const tr = pts.slice(idx + 1).find((p) => p.transfer);
    if (tr) {
      const nl = legAfterTransfer(j, pts, pts.indexOf(tr));
      action = `Change at ${getStation(tr.code).name} for ${lineLabel(getLine(nl.lineId))}`;
    }
  }
  return { pts, idx, current, next, nextAt, eta, stopsLeft: last - idx, progress: phase === 'arrived' ? 1 : progress, phase, action, legIndex };
}

function activityProps(trip: Trip, p: Progress): TripActivityProps {
  const leg = trip.journey.legs[Math.min(p.legIndex, trip.journey.legs.length - 1)];
  const line = getLine(leg.lineId);
  return {
    lineColor: line.color,
    lineText: onLineColor(line.color),
    lineName: lineLabel(line),
    towards: leg.towards,
    current: getStation(p.current.code).name,
    next: p.next ? getStation(p.next.code).name : getStation(trip.journey.to).name,
    nextAt: Math.round(p.nextAt),
    dest: getStation(trip.journey.to).name,
    eta: Math.round(p.eta),
    start: Math.round(p.pts[0].at + trip.delayMs),
    stopsLeft: p.stopsLeft,
    progress: p.progress,
    action: p.action,
    phase: p.phase,
  };
}

// ---------- Live Activity ----------
function findActivity(trip: Trip) {
  if (Platform.OS !== 'ios') return null;
  try {
    const all = TripActivity.getInstances();
    return all.find((a) => a.getId() === trip.activityId) ?? all[0] ?? null;
  } catch {
    return null;
  }
}

async function syncActivity(trip: Trip, p: Progress) {
  if (Platform.OS !== 'ios' || !useSettings.getState().liveActivities) return;
  const props = activityProps(trip, p);
  try {
    const inst = findActivity(trip);
    if (inst) {
      if (p.phase === 'arrived') {
        await inst.end(after(new Date(Date.now() + 5 * 60 * 1000)), props, new Date());
      } else {
        await inst.update(props, new Date(p.eta + 15 * 60 * 1000));
      }
    } else if (p.phase !== 'arrived') {
      const created = TripActivity.start(props, 'mettro://trip', new Date(p.eta + 15 * 60 * 1000));
      useTrip.getState().patch({ activityId: created.getId() });
    }
  } catch (e) {
    console.warn('Live Activity error', e);
  }
}

export async function endAllActivities() {
  if (Platform.OS !== 'ios') return;
  try {
    for (const a of TripActivity.getInstances()) await a.end('immediate');
  } catch {}
}

// ---------- Location ----------
let fgSub: Location.LocationSubscription | null = null;

async function startLocation() {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';
    let bgOk = false;
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      bgOk = bg.status === 'granted';
    } catch {}
    if (bgOk) {
      const started = await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK).catch(() => false);
      if (!started) {
        await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          distanceInterval: 80,
          timeInterval: 15000,
          activityType: Location.ActivityType.OtherNavigation,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
        });
      }
      return 'background';
    }
    fgSub?.remove();
    fgSub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 80, timeInterval: 15000 }, (loc) =>
      onFix({ lat: loc.coords.latitude, lng: loc.coords.longitude, acc: loc.coords.accuracy ?? 999, at: loc.timestamp }),
    );
    return 'foreground';
  } catch (e) {
    console.warn('location', e);
    return 'error';
  }
}

async function stopLocation() {
  fgSub?.remove();
  fgSub = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
  } catch {}
}

if (!TaskManager.isTaskDefined(TRIP_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRIP_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const loc = data.locations[data.locations.length - 1];
    await onFix({ lat: loc.coords.latitude, lng: loc.coords.longitude, acc: loc.coords.accuracy ?? 999, at: loc.timestamp });
  });
}

const GOOD_FIX_M = 150; // worse than this (typical underground / indoor) → ignore, keep dead-reckoning
const ON_ROUTE_KM = 0.5; // further than this from the route → not on the train, ignore
const AT_STATION_KM = 0.2;

/** Closest point on segment a→b to p, as fraction along it and distance (flat-earth approx; fine at metro scale). */
function project(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky, px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const f = len2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const km = Math.hypot(px - (ax + f * dx), py - (ay + f * dy));
  return { f, km, segKm: Math.sqrt(len2) };
}

/**
 * Place a GPS fix on the route and re-time the trip around it.
 * - Between stations: the offset is set so the timeline is exactly at that point now.
 * - At a station (train may be dwelling): the offset is nudged just enough that we're
 *   "at station i" — past its time, not yet at the next one.
 */
export async function onFix(fix: Fix) {
  const st = useTrip.getState();
  const trip = st.trip;
  if (!trip || trip.ended) return;
  if (fix.acc > GOOD_FIX_M) return st.patch({ lastFix: fix });

  const pts = buildTimeline(trip.journey, trip.startedAt);
  const last = pts.length - 1;
  const from = Math.max(0, trip.idx - 2);
  let best: { i: number; f: number; km: number; segKm: number } | null = null;
  for (let i = from; i < last; i++) {
    const r = project(fix, getStation(pts[i].code), getStation(pts[i + 1].code));
    // prefer the earliest segment among near-ties so a route that doubles back can't jump ahead
    if (!best || r.km < best.km - 0.05) best = { i, ...r };
  }
  if (!best || best.km > ON_ROUTE_KM) return st.patch({ lastFix: fix });

  const { i, f, segKm } = best;
  const kmFromA = f * segKm;
  const kmToB = (1 - f) * segKm;
  const now = fix.at;
  let delay: number;
  if (kmFromA < AT_STATION_KM || kmToB < AT_STATION_KM) {
    const at = kmFromA < AT_STATION_KM ? i : i + 1;
    const lo = at < last ? now - pts[at + 1].at + 1000 : -Infinity; // not yet at the next stop
    const hi = at > 0 ? now - pts[at].at : Infinity; // already reached this one
    delay = Math.min(hi, Math.max(lo, trip.delayMs));
  } else {
    delay = now - (pts[i].at + f * (pts[i + 1].at - pts[i].at));
  }
  delay = Math.min(60 * 60e3, Math.max(-60 * 60e3, delay));
  st.patch({ lastFix: fix, delayMs: delay, gpsIdxAt: Date.now() });
  await tick();
}

/** Recompute progress and push to Live Activity. Call on a timer while the app is active. */
export async function tick() {
  const trip = useTrip.getState().trip;
  if (!trip) return null;
  if (trip.ended) {
    // clear a finished trip 10 minutes after arrival
    const p = computeProgress(trip);
    if (Date.now() - Math.min(p.eta, trip.gpsIdxAt ?? p.eta) > 10 * 60e3) useTrip.getState().setTrip(null);
    return null;
  }
  const p = computeProgress(trip);
  if (p.idx !== trip.idx) useTrip.getState().patch({ idx: p.idx });
  const t2 = useTrip.getState().trip!;
  await syncActivity(t2, p);
  if (p.phase === 'arrived') {
    useTrip.getState().patch({ ended: true });
    await stopLocation();
  }
  return p;
}

export function plannedStart(j: Journey, now = Date.now()) {
  const d = j.legs[0]?.depart;
  if (d) {
    const at = clockToday(d, now);
    if (at >= now - 3 * 60e3 && at <= now + 45 * 60e3) return at;
  }
  return now + 60e3; // assume next train in ~1 min
}

export async function startTrip(j: Journey, startAt?: number) {
  const old = useTrip.getState().trip;
  if (old) await stopTrip();
  const trip: Trip = {
    journey: j,
    startedAt: startAt ?? plannedStart(j),
    delayMs: 0,
    idx: 0,
    lastFix: null,
    gpsIdxAt: null,
    activityId: null,
    ended: false,
  };
  useTrip.getState().setTrip(trip);
  const loc = await startLocation();
  await tick();
  return loc;
}

export async function stopTrip() {
  await stopLocation();
  await endAllActivities();
  useTrip.getState().setTrip(null);
}

/** Manually correct position: user says "I'm at station i" */
export async function setPosition(i: number) {
  const trip = useTrip.getState().trip;
  if (!trip) return;
  const pts = buildTimeline(trip.journey, trip.startedAt);
  const delay = Date.now() - pts[i].at;
  useTrip.getState().patch({ idx: i, delayMs: delay, gpsIdxAt: Date.now(), ended: false });
  await tick();
}
