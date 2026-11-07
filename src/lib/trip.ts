import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { after } from 'expo-widgets';

import { whenHydrated } from '@/lib/hydration';
import { getLine, getStation, haversineKm, lineLabel, onLineColor } from '@/lib/network';
import { INTERCHANGE_SECONDS, type Journey } from '@/lib/router';
import { checkServiceHours } from '@/lib/service';
import { clockToEpoch, istClock } from '@/lib/time';
import { useSettings } from '@/store/settings';
import { useTrip, type Anchor, type Fix, type Trip } from '@/store/trip';
import TripActivity, { type TripActivityProps } from '@/widgets/TripActivity';

export const TRIP_LOCATION_TASK = 'mettro-trip-location';

// ---- GPS acceptance ----
/** Fixes worse than this (typical underground / indoors) are ignored; the timetable fills the gap. */
const GOOD_FIX_M = 150;
/** Further than this from the route the fix isn't us on this train (nearby road, parallel line…). */
const ON_ROUTE_KM = 0.3;
/** Actual distance to a station for "we're at that station". */
const AT_STATION_KM = 0.2;
/** Cached / delayed fixes older than this are ignored. */
const MAX_FIX_AGE_MS = 60e3;
/** A fix may move us along the timetable at most this much faster than real time (+ slack). */
const MAX_PROGRESS_RATE = 1.6;
const PROGRESS_SLACK_MS = 3 * 60e3;
/** Moving backwards needs two agreeing fixes (jitter near stations shouldn't flicker). */
const BACK_TOLERANCE_MS = 60e3;
/** Consecutive good off-route fixes before we tell the rider. */
const OFF_ROUTE_ALERT = 3;

// ---- lifecycle ----
/** Without GPS confirmation, give up waiting for the destination this long after the ETA. */
const ARRIVAL_TIMEOUT_MS = 10 * 60e3;
/** Keep a finished trip (and GPS) around this long so a late fix can still correct it. */
const ARRIVED_RETENTION_MS = 10 * 60e3;
/** Start a trip in "waiting" mode if the first train is at most this far away. */
const MAX_WAIT_MS = 6 * 3600e3;
/** Trips older than this are abandoned on restore. */
const MAX_TRIP_AGE_MS = 8 * 3600e3;

export type TimelinePoint = {
  code: string;
  legIndex: number;
  at: number; // planned arrival (epoch ms, without delay)
  dep: number; // planned departure; differs from `at` at the origin and interchanges
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
  /** Station at or just behind the rider. */
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
  /** Several good fixes say we're not on this route (wrong train or direction). */
  offRoute: boolean;
  /** Arrival is only estimated (no GPS at the destination yet). */
  estimated: boolean;
};

function legAfterTransfer(j: Journey, pts: TimelinePoint[], i: number) {
  return j.legs[pts[i].legIndex + 1];
}

/** Station index whose [arrival, next arrival) window contains timetable time `tau`. */
function indexAt(pts: TimelinePoint[], tau: number) {
  let i = 0;
  for (let k = 0; k < pts.length; k++) if (pts[k].at <= tau) i = k;
  return i;
}

/** Pure: position and display state at `now`. GPS sets `delayMs`; the clock carries it forward. */
export function computeProgress(trip: Trip, now = Date.now()): Progress {
  const j = trip.journey;
  const pts = buildTimeline(j, trip.startedAt);
  const last = pts.length - 1;
  const tau = now - trip.delayMs;
  let idx = indexAt(pts, tau);
  const arrived = !!trip.arrivedAt;
  // Without confirmation we never declare arrival from the clock alone: hold one stop short.
  let estimated = false;
  if (arrived) idx = last;
  else if (idx >= last) {
    idx = last - 1;
    estimated = true;
  }
  const current = pts[idx];
  const next = idx < last ? pts[idx + 1] : null;
  const eta = pts[last].at + trip.delayMs;
  const departAt = pts[0].dep + trip.delayMs;
  const nextAt = next ? next.at + trip.delayMs : eta;
  const progress = Math.min(1, Math.max(0, (now - departAt) / Math.max(1, eta - departAt)));
  const legIndex = next ? next.legIndex : current.legIndex;
  const offRoute = trip.offRoute >= OFF_ROUTE_ALERT;

  let phase: Progress['phase'] = 'riding';
  let action = `Get off at ${getStation(j.to).name}`;
  const changeText = (i: number) => {
    const nl = legAfterTransfer(j, pts, i);
    return `${lineLabel(getLine(nl.lineId))} → ${nl.towards}${nl.platform ? ' · ' + nl.platform.replace('Platform No.', 'P') : ''}`;
  };
  if (arrived) {
    phase = 'arrived';
    action = 'You have arrived';
  } else if (idx === 0 && tau < pts[0].dep - 60e3) {
    phase = 'waiting';
    const leg = j.legs[0];
    action = `Board ${lineLabel(getLine(leg.lineId))} → ${leg.towards}${leg.platform ? ' · ' + leg.platform.replace('Platform No.', 'P') : ''}`;
  } else if (current.transfer && tau <= current.dep) {
    phase = 'transfer';
    action = `Change here: ${changeText(idx)}`;
  } else if (next?.transfer) {
    phase = 'transfer';
    action = `Change at ${getStation(next.code).name} for ${lineLabel(getLine(legAfterTransfer(j, pts, idx + 1).lineId))}`;
  } else if (next && idx + 1 === last) {
    phase = 'arriving';
    action = `Get off at ${getStation(next.code).name}`;
  } else {
    const tr = pts.slice(idx + 1).find((p) => p.transfer);
    if (tr) action = `Change at ${getStation(tr.code).name} for ${lineLabel(getLine(legAfterTransfer(j, pts, pts.indexOf(tr)).lineId))}`;
  }
  if (offRoute && !arrived) action = 'Off route? Check you’re on the right train';
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
    offRoute,
    estimated,
  };
}

/**
 * The point where the rider must act next: the interchange they're standing at (until its train
 * leaves), otherwise the next change or the destination.
 */
function nextMilestone(trip: Trip, p: Progress, now: number) {
  const last = p.pts.length - 1;
  const cur = p.pts[p.idx];
  if (cur.transfer && p.idx < last && now <= cur.dep + trip.delayMs) return { pt: cur, i: p.idx, here: true };
  for (let i = p.idx + 1; i <= last; i++) if (p.pts[i].transfer || i === last) return { pt: p.pts[i], i, here: false };
  return { pt: p.pts[last], i: last, here: false };
}

/**
 * When iOS will suspend the app (no background location), the Live Activity can't be updated
 * stop by stop, so it shows content that stays true until the next milestone instead.
 */
function milestoneMode(trip: Trip) {
  return trip.tracking !== 'background';
}

export function activityProps(trip: Trip, p: Progress, now = Date.now()): TripActivityProps {
  const j = trip.journey;
  const leg = j.legs[Math.min(p.legIndex, j.legs.length - 1)];
  const line = getLine(leg.lineId);
  const base = {
    lineColor: line.color,
    lineText: onLineColor(line.color),
    lineName: lineLabel(line),
    towards: leg.towards,
    current: getStation(p.current.code).name,
    dest: getStation(j.to).name,
    eta: Math.round(p.eta),
    etaText: istClock(p.eta),
    departText: istClock(p.departAt),
    start: Math.round(p.departAt),
    stopsLeft: p.stopsLeft,
    progress: p.progress,
    phase: p.phase,
  };
  const changeText = (legIndexAfter: number) => {
    const nl = j.legs[legIndexAfter];
    return `${lineLabel(getLine(nl.lineId))} → ${nl.towards}${nl.platform ? ' · ' + nl.platform.replace('Platform No.', 'P') : ''}`;
  };
  if (p.phase === 'arrived') return { ...base, title: `Arrived at ${base.dest}`, next: base.dest, nextAt: Math.round(p.eta), action: p.action };
  if (p.offRoute)
    return { ...base, title: 'Off route?', next: base.current, nextAt: Math.round(p.eta), action: 'Check you’re on the right train · open Mettro' };
  const milestones = milestoneMode(trip);
  if (p.phase === 'waiting') {
    let action = p.action;
    if (milestones) {
      // the app may be suspended while waiting: also say what comes after boarding
      const first = p.pts.find((pt, i) => i > 0 && (pt.transfer || i === p.pts.length - 1))!;
      const at = istClock(first.at + trip.delayMs);
      action += first.transfer ? ` · change at ${getStation(first.code).name} ${at}` : ` · get off at ${getStation(first.code).name} ${at}`;
    }
    return { ...base, title: `Train at ${base.departText}`, next: base.current, nextAt: Math.round(p.departAt), action };
  }
  if (milestones) {
    const m = nextMilestone(trip, p, now);
    const name = getStation(m.pt.code).name;
    if (m.here) {
      // standing at an interchange: keep the change instruction until the onward train leaves
      const dep = m.pt.dep + trip.delayMs;
      return {
        ...base,
        phase: 'transfer',
        title: `Change here · train ${istClock(dep)}`,
        next: name,
        nextAt: Math.round(dep),
        action: changeText(m.pt.legIndex + 1),
      };
    }
    const at = m.pt.at + trip.delayMs;
    if (m.pt.transfer) {
      return {
        ...base,
        phase: 'transfer',
        title: `Change at ${name} · ${istClock(at)}`,
        next: name,
        nextAt: Math.round(at),
        action: changeText(m.pt.legIndex + 1),
      };
    }
    return {
      ...base,
      phase: 'arriving',
      title: `Get off at ${name} · ${istClock(at)}`,
      next: name,
      nextAt: Math.round(at),
      action: `${m.i - p.idx} stop${m.i - p.idx === 1 ? '' : 's'} · towards ${leg.towards}`,
    };
  }
  const nextName = p.next ? getStation(p.next.code).name : base.dest;
  return {
    ...base,
    title: p.phase === 'arriving' ? `Next: ${nextName} — get off` : `Next: ${nextName}`,
    next: nextName,
    nextAt: Math.round(p.nextAt),
    action: p.action,
  };
}

/** iOS dims the activity after this if no newer content arrived. */
function staleDate(trip: Trip, p: Progress, now = Date.now()) {
  if (!milestoneMode(trip)) return new Date(p.eta + 15 * 60e3);
  // waiting: content is about the departure; afterwards it's about the active milestone
  if (p.phase === 'waiting') return new Date(p.departAt + 2 * 60e3);
  const m = nextMilestone(trip, p, now);
  return new Date((m.here ? m.pt.dep : m.pt.at) + trip.delayMs + 2 * 60e3);
}

// ---------- Live Activity ----------
let lastPushed = '';
let createdAt = 0;
let missing = 0;

function activityLookup(id: string | null) {
  if (Platform.OS !== 'ios' || !id) return null;
  try {
    return TripActivity.getInstances().find((a) => a.getId() === id) ?? null;
  } catch {
    return 'error' as const;
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
    const lookup = activityLookup(trip.activityId);
    if (lookup === 'error') return; // couldn't ask ActivityKit; try again next tick
    const inst = lookup;
    if (trip.activityId && !inst) {
      // Gone from ActivityKit: the user swiped it away (or iOS ended it). Require a few consecutive
      // misses well after creation so a lookup right after start() isn't mistaken for a dismissal.
      missing += 1;
      if (missing >= 3 && Date.now() - createdAt > 15e3) {
        useTrip.getState().patch({ activityDismissed: true, activityId: null });
        missing = 0;
      }
      return;
    }
    missing = 0;
    if (inst) {
      if (p.phase === 'arrived') {
        await inst.end(after(new Date(Date.now() + 5 * 60e3)), props, new Date());
        useTrip.getState().patch({ activityId: null, activityDismissed: true });
        lastPushed = '';
        return;
      }
      const key = JSON.stringify({ ...props, progress: Math.round(props.progress * 50) });
      if (key === lastPushed) return; // nothing visible changed
      await inst.update(props, staleDate(trip, p));
      lastPushed = key;
    } else if (!trip.activityDismissed && p.phase !== 'arrived') {
      const created = TripActivity.start(props, 'mettro://trip', staleDate(trip, p));
      useTrip.getState().patch({ activityId: created.getId() });
      createdAt = Date.now();
      missing = 0;
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

/** Closest point on segment a→b to p: fraction along it and distance (flat-earth; fine at metro scale). */
function project(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = a.lng * kx,
    ay = a.lat * ky,
    bx = b.lng * kx,
    by = b.lat * ky,
    px = p.lng * kx,
    py = p.lat * ky;
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const f = len2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return { f, km: Math.hypot(px - (ax + f * dx), py - (ay + f * dy)) };
}

type Candidate = { tau: number; idx: number; station: number | null; km: number };

/**
 * Where on the route a fix puts us, in timetable time. Searches the whole route (so GPS can always
 * correct the clock, in either direction); among near-equal matches the one closest to the current
 * estimate wins, so a route passing the same area twice doesn't jump.
 */
function locate(trip: Trip, pts: TimelinePoint[], fix: Fix): Candidate | null {
  const last = pts.length - 1;
  const tauEst = fix.at - trip.delayMs;
  const better = (c: Candidate, best: Candidate | null) =>
    !best || c.km < best.km - 0.05 || (Math.abs(c.km - best.km) <= 0.05 && Math.abs(c.tau - tauEst) < Math.abs(best.tau - tauEst));
  let best: Candidate | null = null;
  // stations first: actual distance to the station, not along a segment
  for (let i = 0; i <= last; i++) {
    const s = getStation(pts[i].code);
    const km = haversineKm(fix.lat, fix.lng, s.lat, s.lng);
    if (km > AT_STATION_KM) continue;
    const same = trip.anchor ? trip.anchor.station === i : i === 0;
    // Same station as before (origin wait, dwell, interchange walk): we can only be later than
    // planned, never earlier. Newly reached: we're somewhere inside its [arrival, departure].
    const tau = same ? Math.min(tauEst, pts[i].dep) : Math.min(pts[i].dep, Math.max(pts[i].at, tauEst));
    const c = { tau, idx: i, station: i, km };
    if (better(c, best)) best = c;
  }
  if (best) return best;
  for (let i = 0; i < last; i++) {
    const r = project(fix, getStation(pts[i].code), getStation(pts[i + 1].code));
    if (r.km > ON_ROUTE_KM) continue;
    const c = { tau: pts[i].dep + r.f * (pts[i + 1].at - pts[i].dep), idx: i, station: null, km: r.km };
    if (better(c, best)) best = c;
  }
  return best;
}

/** Place a GPS fix on the route and re-time the trip around it. Always ticks. */
export async function onFix(fix: Fix) {
  const st = useTrip.getState();
  const trip = st.trip;
  if (!trip) return;
  const now = Date.now();
  const usable = fix.acc <= GOOD_FIX_M && fix.at >= now - MAX_FIX_AGE_MS && fix.at >= trip.createdAt - 30e3;
  if (!usable) {
    st.patch({ lastFix: fix });
    await tick();
    return;
  }
  const pts = buildTimeline(trip.journey, trip.startedAt);
  const last = pts.length - 1;
  const c = locate(trip, pts, fix);
  if (!c) {
    st.patch({ lastFix: fix, offRoute: trip.offRoute + 1 });
    await tick();
    return;
  }
  // Plausibility: a fix can't move us along the route faster than a train could have since the
  // last accepted one (rejects stale cached fixes and jumps to nearby parallel track).
  const prevTau = trip.anchor?.tau ?? pts[0].dep;
  const prevAt = trip.anchor?.at ?? Math.max(trip.createdAt, Math.min(fix.at, trip.startedAt));
  const maxAdvance = Math.max(0, fix.at - prevAt) * MAX_PROGRESS_RATE + PROGRESS_SLACK_MS;
  if (c.tau - prevTau > maxAdvance) {
    st.patch({ lastFix: fix });
    await tick();
    return;
  }
  // Moving backwards needs a second agreeing fix.
  if (trip.anchor && c.tau < trip.anchor.tau - BACK_TOLERANCE_MS) {
    const pending = trip.backPending;
    if (!pending || Math.abs(pending.tau - c.tau) > 2 * 60e3) {
      st.patch({ lastFix: fix, backPending: { tau: c.tau, idx: c.idx, station: c.station, at: fix.at } });
      await tick();
      return;
    }
  }
  const anchor: Anchor = { tau: c.tau, idx: c.idx, station: c.station, at: fix.at };
  const patch: Partial<Trip> = { lastFix: fix, anchor, backPending: null, offRoute: 0, delayMs: fix.at - c.tau };
  if (c.station === last && !trip.arrivedAt) {
    patch.arrivedAt = now;
    patch.arrivedBy = 'gps';
  } else if (c.station !== last && trip.arrivedAt && trip.arrivedBy === 'time') {
    // the clock gave up too early: we're still riding
    patch.arrivedAt = null;
    patch.arrivedBy = null;
  }
  st.patch(patch);
  await tick();
}

/** Recompute progress, push it to the Live Activity, and manage the trip lifecycle. */
export async function tick() {
  const trip = useTrip.getState().trip;
  if (!trip) return null;
  const now = Date.now();
  if ((trip.arrivedAt && now - trip.arrivedAt > ARRIVED_RETENTION_MS) || now - trip.createdAt > MAX_TRIP_AGE_MS) {
    await stopTrip();
    return null;
  }
  let p = computeProgress(trip, now);
  if (!trip.arrivedAt && now > p.eta + ARRIVAL_TIMEOUT_MS) {
    // no GPS at the destination, long past the ETA: assume we got there
    useTrip.getState().patch({ arrivedAt: now, arrivedBy: 'time' });
    p = computeProgress(useTrip.getState().trip!, now);
  }
  await syncActivity(useTrip.getState().trip!, p);
  return p;
}

/**
 * Planned departure for a new trip: the planner's train if it's within MAX_WAIT_MS; offline,
 * the first train of the day if service hasn't started; otherwise "now + 1 min".
 */
export function plannedStart(j: Journey, now = Date.now()) {
  const d = j.legs[0]?.depart;
  if (d) {
    const at = clockToEpoch(d, now);
    if (at >= now - 3 * 60e3 && at <= now + MAX_WAIT_MS) return at;
  }
  const issue = checkServiceHours(j, now);
  if (issue?.kind === 'before-first' && issue.legIndex === 0 && issue.timing.first) {
    const at = clockToEpoch(issue.timing.first, now);
    if (at > now && at <= now + MAX_WAIT_MS) return at;
  }
  return now + 60e3;
}

export async function startTrip(j: Journey, startAt?: number) {
  if (useTrip.getState().trip) await stopTrip();
  const now = Date.now();
  const trip: Trip = {
    journey: j,
    createdAt: now,
    startedAt: startAt ?? plannedStart(j, now),
    delayMs: 0,
    anchor: null,
    lastFix: null,
    offRoute: 0,
    backPending: null,
    activityId: null,
    activityDismissed: false,
    arrivedAt: null,
    arrivedBy: null,
    tracking: 'none',
  };
  useTrip.getState().setTrip(trip);
  const loc = await startLocation(true);
  useTrip.getState().patch({ tracking: loc === 'background' ? 'background' : loc === 'foreground' ? 'foreground' : 'none' });
  ensureController();
  await tick();
  return loc;
}

export async function stopTrip() {
  await stopLocation();
  await endAllActivities();
  useTrip.getState().setTrip(null);
}

/** The rider says "I'm at station i" (or taps Done at the destination). */
export async function setPosition(i: number) {
  const trip = useTrip.getState().trip;
  if (!trip) return;
  const pts = buildTimeline(trip.journey, trip.startedAt);
  const now = Date.now();
  const last = pts.length - 1;
  const tauEst = now - trip.delayMs;
  // at the origin before departure keep the plan; elsewhere we're at that station now
  const tau = i === 0 ? Math.min(tauEst, pts[0].dep) : Math.min(pts[i].dep, Math.max(pts[i].at, tauEst));
  useTrip.getState().patch({
    anchor: { tau, idx: i, station: i, at: now },
    backPending: null,
    offRoute: 0,
    delayMs: now - tau,
    arrivedAt: i === last ? now : null,
    arrivedBy: i === last ? 'user' : null,
  });
  await resumeTracking();
  await tick();
}

// ---------- Controller ----------
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Tick on a timer independently of which screen is open. While background location updates run
 * iOS keeps the app alive, so this also advances the Live Activity underground (no fixes).
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
  if (!trip || Date.now() - trip.createdAt > MAX_TRIP_AGE_MS) {
    // no (valid) trip: don't leave native tracking or a Live Activity behind
    await stopLocation();
    await endAllActivities();
    if (trip) useTrip.getState().setTrip(null);
    return;
  }
  ensureController();
  const mode = await startLocation(false);
  useTrip.getState().patch({ tracking: mode === 'background' ? 'background' : mode === 'foreground' ? 'foreground' : 'none' });
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
