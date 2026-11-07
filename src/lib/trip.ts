import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { after } from 'expo-widgets';

import { whenHydrated } from '@/lib/hydration';
import { getLine, getStation, haversineKm, lineLabel, onLineColor } from '@/lib/network';
import { INTERCHANGE_SECONDS, type Journey } from '@/lib/router';
import { clockToEpoch, istClock } from '@/lib/time';
import { useSettings } from '@/store/settings';
import { useTrip, type Fix, type Trip } from '@/store/trip';
import TripActivity, { type TripActivityProps } from '@/widgets/TripActivity';

export const TRIP_LOCATION_TASK = 'mettro-trip-location';

/** How long a GPS/user confirmation holds the timetable back (it may run at most one stop ahead). */
const ANCHOR_HOLD_MS = 4 * 60e3;
/** Timetable-only arrival needs this much slack past the ETA (GPS confirmation arrives immediately). */
const ARRIVAL_GRACE_MS = 2 * 60e3;
/** Keep a finished trip (and GPS) around this long so a late fix can still correct it. */
const ARRIVED_RETENTION_MS = 10 * 60e3;
/** Start a trip in "waiting" mode if the first train is at most this far away. */
const MAX_WAIT_MS = 6 * 3600e3;
const NEAR_STATION_KM = 0.45;
const AT_STATION_KM = 0.3;

export type TimelinePoint = {
  code: string;
  legIndex: number;
  at: number; // planned arrival (epoch ms, without delay)
  dep: number; // planned departure from this point; differs from `at` at the origin wait and interchanges
  transfer: boolean; // you change trains here
};

/** Absolute timeline. Uses planner departure/arrival when available, else segment estimates. */
export function buildTimeline(j: Journey, startedAt: number): TimelinePoint[] {
  const pts: TimelinePoint[] = [];
  const useClock = j.legs.every((l) => l.depart && l.arrive);
  // All planner times are resolved against one reference (the planned first departure),
  // then shifted if the user started on a different train.
  const firstDep = useClock ? clockToEpoch(j.legs[0].depart!, startedAt) : startedAt;
  const shift = startedAt - firstDep;
  let t = startedAt;
  j.legs.forEach((leg, li) => {
    let legStart: number;
    let span: number;
    const total = leg.segS.reduce((a, b) => a + b, 0) || 1;
    if (useClock) {
      legStart = clockToEpoch(leg.depart!, firstDep) + shift;
      const legEnd = clockToEpoch(leg.arrive!, firstDep) + shift;
      span = legEnd > legStart ? legEnd - legStart : total * 1000;
      // a connection can't leave before we arrive
      if (li > 0 && legStart < t) legStart = t;
    } else {
      legStart = li === 0 ? t : t + INTERCHANGE_SECONDS * 1000;
      span = total * 1000;
    }
    let acc = 0;
    leg.stations.forEach((code, si) => {
      if (si > 0) acc += leg.segS[si - 1];
      const at = legStart + (acc / total) * span;
      if (si === 0 && li > 0) {
        // interchange: we arrived on the previous leg; departure is this leg's start
        const p = pts[pts.length - 1];
        p.transfer = true;
        p.dep = legStart;
        return;
      }
      pts.push({ code, legIndex: li, at, dep: at, transfer: false });
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
  departAt: number;
  eta: number;
  stopsLeft: number;
  progress: number;
  phase: TripActivityProps['phase'];
  action: string;
  legIndex: number;
};

function legAfterTransfer(j: Journey, pts: TimelinePoint[], i: number) {
  return j.legs[pts[i].legIndex + 1];
}

/** Station index the timetable says we've reached by `now`. */
function scheduledIndex(pts: TimelinePoint[], delayMs: number, now: number) {
  let tIdx = 0;
  for (let i = 0; i < pts.length; i++) if (pts[i].at + delayMs <= now) tIdx = i;
  return tIdx;
}

/** Pure: position and display state at `now`. Nothing inferred here is persisted. */
export function computeProgress(trip: Trip, now = Date.now()): Progress {
  const j = trip.journey;
  const pts = buildTimeline(j, trip.startedAt);
  const last = pts.length - 1;
  const tIdx = scheduledIndex(pts, trip.delayMs, now);
  const anchorFresh = trip.anchorAt != null && now - trip.anchorAt < ANCHOR_HOLD_MS;
  let idx = Math.max(tIdx, trip.anchorIdx);
  // A recent confirmation caps the clock at one stop ahead of it (GPS beats the timetable).
  if (anchorFresh) idx = Math.min(idx, trip.anchorIdx + 1);
  // Timetable alone may only call the last stop with some grace; a confirmation or arrivedAt is final.
  if (idx === last && trip.anchorIdx !== last && !trip.arrivedAt && now < pts[last].at + trip.delayMs + ARRIVAL_GRACE_MS) idx = last - 1;
  if (trip.arrivedAt) idx = last;
  idx = Math.min(Math.max(idx, 0), last);

  const current = pts[idx];
  const next = idx < last ? pts[idx + 1] : null;
  const eta = pts[last].at + trip.delayMs;
  const departAt = pts[0].dep + trip.delayMs;
  const nextAt = next ? next.at + trip.delayMs : eta;
  const progress = Math.min(1, Math.max(0, (now - departAt) / Math.max(1, eta - departAt)));
  const legIndex = next ? next.legIndex : current.legIndex;

  let phase: Progress['phase'] = 'riding';
  let action = `Get off at ${getStation(j.to).name}`;
  if (idx === last) {
    phase = 'arrived';
    action = 'You have arrived';
  } else if (idx === 0 && now < departAt - 60e3) {
    phase = 'waiting';
    const leg = j.legs[0];
    action = `Board ${lineLabel(getLine(leg.lineId))} → ${leg.towards}${leg.platform ? ' · ' + leg.platform.replace('Platform No.', 'P') : ''}`;
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
    const tr = pts.slice(idx + 1).find((p) => p.transfer);
    if (tr) {
      const nl = legAfterTransfer(j, pts, pts.indexOf(tr));
      action = `Change at ${getStation(tr.code).name} for ${lineLabel(getLine(nl.lineId))}`;
    }
  }
  return {
    pts,
    idx,
    current,
    next,
    nextAt,
    departAt,
    eta,
    stopsLeft: last - idx,
    progress: phase === 'arrived' ? 1 : phase === 'waiting' ? 0 : progress,
    phase,
    action,
    legIndex,
  };
}

function activityProps(trip: Trip, p: Progress): TripActivityProps {
  const leg = trip.journey.legs[Math.min(p.legIndex, trip.journey.legs.length - 1)];
  const line = getLine(leg.lineId);
  const waiting = p.phase === 'waiting';
  return {
    lineColor: line.color,
    lineText: onLineColor(line.color),
    lineName: lineLabel(line),
    towards: leg.towards,
    current: getStation(p.current.code).name,
    next: waiting ? getStation(p.current.code).name : p.next ? getStation(p.next.code).name : getStation(trip.journey.to).name,
    nextAt: Math.round(waiting ? p.departAt : p.nextAt),
    dest: getStation(trip.journey.to).name,
    eta: Math.round(p.eta),
    etaText: istClock(p.eta),
    departText: istClock(p.departAt),
    start: Math.round(p.departAt),
    stopsLeft: p.stopsLeft,
    progress: p.progress,
    action: p.action,
    phase: p.phase,
  };
}

// ---------- Live Activity ----------
let lastPushed = '';

function activityById(id: string | null) {
  if (Platform.OS !== 'ios' || !id) return null;
  try {
    return TripActivity.getInstances().find((a) => a.getId() === id) ?? null;
  } catch {
    return null;
  }
}

async function syncActivity(trip: Trip, p: Progress) {
  if (Platform.OS !== 'ios') return;
  if (!useSettings.getState().liveActivities) {
    // setting turned off mid-trip: clean up whatever is showing
    if (trip.activityId) {
      await endAllActivities();
      useTrip.getState().patch({ activityId: null });
    }
    return;
  }
  const props = activityProps(trip, p);
  try {
    const inst = activityById(trip.activityId);
    if (trip.activityId && !inst) {
      // the user swiped it away (or iOS ended it) — respect that for this trip
      if (!trip.activityDismissed) useTrip.getState().patch({ activityDismissed: true, activityId: null });
      return;
    }
    if (inst) {
      if (p.phase === 'arrived') {
        await inst.end(after(new Date(Date.now() + 5 * 60e3)), props, new Date());
        useTrip.getState().patch({ activityId: null, activityDismissed: true });
        lastPushed = '';
        return;
      }
      const key = JSON.stringify({ ...props, progress: Math.round(props.progress * 50) });
      if (key === lastPushed) return; // nothing visible changed
      await inst.update(props, new Date(p.eta + 15 * 60e3));
      lastPushed = key;
    } else if (!trip.activityDismissed && p.phase !== 'arrived') {
      const created = TripActivity.start(props, 'mettro://trip', new Date(p.eta + 15 * 60e3));
      useTrip.getState().patch({ activityId: created.getId() });
      lastPushed = '';
    }
  } catch (e) {
    console.warn('Live Activity error', e);
  }
}

export async function endAllActivities() {
  lastPushed = '';
  if (Platform.OS !== 'ios') return;
  try {
    for (const a of TripActivity.getInstances()) await a.end('immediate');
  } catch {}
}

// ---------- Location ----------
let fgSub: Location.LocationSubscription | null = null;

type LocationMode = 'background' | 'foreground' | 'denied' | 'error';

/** Start (or resume) location updates. `ask` = may show permission prompts. */
async function startLocation(ask: boolean): Promise<LocationMode> {
  try {
    const fg = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';
    let bgOk = false;
    try {
      const bg = ask ? await Location.requestBackgroundPermissionsAsync() : await Location.getBackgroundPermissionsAsync();
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
    if (!fgSub) {
      fgSub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 80, timeInterval: 15000 }, (loc) =>
        onFix({ lat: loc.coords.latitude, lng: loc.coords.longitude, acc: loc.coords.accuracy ?? 999, at: loc.timestamp }),
      );
    }
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
    // may run in a fresh JS runtime after the app was killed: wait for persisted state first
    await whenHydrated();
    const loc = data.locations[data.locations.length - 1];
    await onFix({ lat: loc.coords.latitude, lng: loc.coords.longitude, acc: loc.coords.accuracy ?? 999, at: loc.timestamp });
  });
}

/** Snap a GPS fix to the route and learn the delay. Always ticks so the Live Activity follows. */
export async function onFix(fix: Fix) {
  const st = useTrip.getState();
  const trip = st.trip;
  if (!trip) return;
  const patch: Partial<Trip> = { lastFix: fix };
  if (fix.acc <= 350) {
    const pts = buildTimeline(trip.journey, trip.startedAt);
    // Search from the last *confirmed* station so GPS can pull back a timetable that ran ahead.
    let best = -1;
    let bestKm = NEAR_STATION_KM;
    for (let i = Math.max(0, trip.anchorIdx); i < pts.length; i++) {
      const s = getStation(pts[i].code);
      const km = haversineKm(fix.lat, fix.lng, s.lat, s.lng);
      if (km < bestKm) {
        bestKm = km;
        best = i;
      }
    }
    if (best >= 0) {
      const pt = pts[best];
      let delay = trip.delayMs;
      if (bestKm < AT_STATION_KM) {
        if (best > trip.anchorIdx) {
          // first fix at a newly reached station: we arrived around now
          delay = fix.at - pt.at;
        } else {
          // still at the same station (origin wait, dwell, interchange walk): we can only be later
          // than its scheduled departure, never earlier
          delay = Math.max(delay, fix.at - pt.dep);
        }
      }
      patch.delayMs = Math.min(60 * 60e3, Math.max(-30 * 60e3, delay));
      patch.anchorIdx = best;
      patch.anchorAt = Date.now();
      const last = pts.length - 1;
      if (best === last && !trip.arrivedAt) patch.arrivedAt = Date.now();
      // a fix before the destination undoes a timetable-only arrival
      if (best < last && trip.arrivedAt) patch.arrivedAt = null;
    }
  }
  st.patch(patch);
  await tick();
}

/** Recompute progress, push it to the Live Activity, and manage the trip lifecycle. */
export async function tick() {
  const trip = useTrip.getState().trip;
  if (!trip) return null;
  const now = Date.now();
  if (trip.arrivedAt && now - trip.arrivedAt > ARRIVED_RETENTION_MS) {
    await stopTrip();
    return null;
  }
  const p = computeProgress(trip, now);
  if (p.phase === 'arrived' && !trip.arrivedAt) useTrip.getState().patch({ arrivedAt: now });
  await syncActivity(useTrip.getState().trip!, p);
  return p;
}

/**
 * Planned departure for a new trip: the planner's first train if it's within MAX_WAIT_MS,
 * otherwise "now + 1 min" (offline / unknown).
 */
export function plannedStart(j: Journey, now = Date.now()) {
  const d = j.legs[0]?.depart;
  if (d) {
    const at = clockToEpoch(d, now);
    if (at >= now - 3 * 60e3 && at <= now + MAX_WAIT_MS) return at;
  }
  return now + 60e3;
}

export async function startTrip(j: Journey, startAt?: number) {
  if (useTrip.getState().trip) await stopTrip();
  const trip: Trip = {
    journey: j,
    startedAt: startAt ?? plannedStart(j),
    delayMs: 0,
    anchorIdx: 0,
    anchorAt: null,
    lastFix: null,
    activityId: null,
    activityDismissed: false,
    arrivedAt: null,
  };
  useTrip.getState().setTrip(trip);
  const loc = await startLocation(true);
  ensureController();
  await tick();
  return loc;
}

export async function stopTrip() {
  await stopLocation();
  await endAllActivities();
  useTrip.getState().setTrip(null);
}

/** Manually correct position: the user says "I'm at station i". */
export async function setPosition(i: number) {
  const trip = useTrip.getState().trip;
  if (!trip) return;
  const pts = buildTimeline(trip.journey, trip.startedAt);
  const now = Date.now();
  // at the origin before departure, keep the planned departure; otherwise we're here now
  const delay = i === 0 ? Math.max(0, now - pts[0].dep) : now - pts[i].at;
  const last = pts.length - 1;
  useTrip.getState().patch({ anchorIdx: i, anchorAt: now, delayMs: delay, arrivedAt: i === last ? now : null });
  await resumeTracking();
  await tick();
}

// ---------- Controller ----------
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Keep the trip ticking independently of which screen is open. While background location
 * updates are running iOS keeps the app alive, so this also advances the Live Activity
 * underground where no GPS fixes arrive.
 */
function ensureController() {
  if (timer) return;
  timer = setInterval(() => {
    if (!useTrip.getState().trip) {
      if (timer) clearInterval(timer);
      timer = null;
      return;
    }
    tick().catch(() => {});
  }, 5000);
}

/** Resume GPS + controller for an active trip (after relaunch or a manual correction). Never prompts. */
export async function resumeTracking() {
  await whenHydrated();
  const trip = useTrip.getState().trip;
  if (!trip) return;
  ensureController();
  await startLocation(false);
}

// Turning Live Activities off mid-trip removes the one on screen right away.
useSettings.subscribe((s, prev) => {
  if (prev.liveActivities && !s.liveActivities) {
    endAllActivities().catch(() => {});
    useTrip.getState().patch({ activityId: null });
  }
});

AppState.addEventListener('change', (s) => {
  if (s === 'active' && useTrip.getState().trip) {
    ensureController();
    tick().catch(() => {});
  }
});
