/* Regression tests for review findings. Run: npm test (UTC and Asia/Kolkata). */
import { activityProps, buildTimeline, computeProgress, onFix, plannedStart, resumeTracking, setPosition, tick } from '@/lib/trip';
import { planOnline } from '@/lib/api';
import { planOffline, type Journey } from '@/lib/router';
import { useTrip, type Trip } from '@/store/trip';
import { getStation, linesBetween } from '@/lib/network';
import { clockToEpoch, istIso, serviceMinutes, timetableMinutes } from '@/lib/time';
import { fareFor } from '@/lib/fare';
import { checkServiceHours } from '@/lib/service';
import { isNormal } from '@/store/status';

let pass = 0,
  fail = 0;
const ok = (name: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL', name, info ?? '');
  }
};
const IST = (s: string) => Date.parse(s + '+05:30');
const realNow = Date.now;
const setNow = (t: number) => {
  Date.now = () => t;
};
const realFetch = globalThis.fetch;
const mockFetch = (body: unknown) => {
  globalThis.fetch = (async () => new Response(JSON.stringify(body))) as typeof fetch;
};

function newTrip(j: Journey, startedAt: number, extra: Partial<Trip> = {}) {
  useTrip.getState().setTrip({
    journey: j,
    createdAt: Math.min(startedAt, Date.now()),
    startedAt,
    delayMs: 0,
    anchor: null,
    lastFix: null,
    offRoute: 0,
    backPending: null,
    activityId: null,
    activityDismissed: false,
    arrivedAt: null,
    arrivedBy: null,
    tracking: 'background',
    ...extra,
  });
}
const T = () => useTrip.getState().trip!;
const at = (code: string, when: number, acc = 10) => ({ lat: getStation(code).lat, lng: getStation(code).lng, acc, at: when });
/** A point between two stations (fraction f from a). */
const between = (a: string, b: string, f: number, when: number) => {
  const A = getStation(a),
    B = getStation(b);
  return { lat: A.lat + (B.lat - A.lat) * f, lng: A.lng + (B.lng - A.lng) * f, acc: 10, at: when };
};
/** Feed a fix "now". */
async function gps(fix: { lat: number; lng: number; acc: number; at: number }) {
  setNow(fix.at);
  await onFix(fix);
}

(async () => {
  const t0 = IST('2026-11-10T10:00:00');

  // ================= time =================
  ok('istIso', istIso(IST('2026-11-10T15:30:00')) === '2026-11-10T15:30:00.000');
  ok('24:10 next day', clockToEpoch('24:10:00', IST('2026-11-10T23:59:00')) === IST('2026-11-11T00:10:00'));
  ok('00:10 after midnight ref', clockToEpoch('00:10:00', IST('2026-11-11T00:05:00')) === IST('2026-11-11T00:10:00'));
  ok('first train asked at 02:00', clockToEpoch('05:48:00', IST('2026-11-11T02:00:00')) === IST('2026-11-11T05:48:00'));
  ok('serviceMinutes 00:30 > 23:00', serviceMinutes(IST('2026-11-11T00:30:00')) > timetableMinutes('23:00')!);
  ok('isNormal strict', isNormal('Normal Service') && !isNormal('Not normal') && !isNormal('Partial Service'));

  // ================= routing =================
  ok('Rapid one-way DL2->DL3 goes round the loop', planOffline('DL2', 'DL3', 'fastest')!.stops > 1);
  ok('Rapid one-way BEL->DL2 goes round the loop', planOffline('BEL', 'DL2', 'fastest')!.stops > 1);
  ok('AVIT-KKDA is shared by two lines', linesBetween('AVIT', 'KKDA').length === 2);
  const rv = planOffline('RCK', 'VASI', 'fastest')!;
  ok(
    'RCK->VASI single Blue leg towards Vaishali',
    rv.legs.length === 1 && rv.legs[0].towards === 'Vaishali',
    rv.legs.map((l) => [l.lineId, l.towards]),
  );
  const vn = planOffline('VASI', 'NSET', 'fastest')!;
  ok(
    'VASI->Noida changes at Yamuna Bank',
    vn.legs.length === 2 && vn.legs[0].stations.at(-1) === 'YB',
    vn.legs.map((l) => l.stations.at(-1)),
  );
  ok('Dwarka->Vaishali through-runs', planOffline('DSTO', 'VASI', 'fewest-changes')!.legs.length === 1);

  // ================= API parsing (mocked DMRC) =================
  const leg = (o: object) => ({ line: 'Pink Line', line_no: 7, towards_station: 'MAUJPUR-BABARPUR', platform_name: 'Platform No. 1', ...o });
  mockFetch({
    stations: 2,
    fare: 11,
    route: [
      leg({
        path: [{ name: 'BURARI' }, { name: 'MAJLIS PARK' }],
        'map-path': ['BURI-MKPR'],
        path_time: '0:00:02',
        new_start_time: '12:03:50',
        new_end_time: '12:03:52',
      }),
    ],
  });
  const bm = await planOnline('BURI', 'MKPR', new Date(IST('2026-11-10T12:00:00')), 'least-distance');
  ok('2-second planner leg replaced', bm.totalS > 120 && bm.legs[0].segS[0] > 120 && bm.legs[0].arrive === null, [bm.totalS, bm.legs[0].arrive]);
  mockFetch({
    stations: 2,
    fare: 11,
    route: [
      leg({
        path: [{ name: 'BURARI' }, { name: 'MAJLIS PARK' }],
        'map-path': ['BURI-MKPR'],
        path_time: '0:04:00',
        new_start_time: '10:00:00',
        new_end_time: '09:59:00',
      }),
    ],
  });
  const bt = await planOnline('BURI', 'MKPR', new Date(IST('2026-11-10T09:50:00')), 'least-distance');
  ok('arrival before departure not a 23 h trip', bt.totalS < 3600, bt.totalS);
  mockFetch({
    stations: 3,
    fare: 11,
    route: [
      leg({
        path: [{ name: 'ANAND VIHAR ISBT' }, { name: 'KARKARDUMA' }, { name: 'KARKARDUMA COURT' }],
        'map-path': ['AVIT-KKDA', 'KKDA-KKDC'],
        path_time: '0:04:00',
        new_start_time: '10:00:00',
        new_end_time: '10:04:00',
      }),
    ],
  });
  ok('shared track uses line_no (Pink)', (await planOnline('AVIT', 'KKDC', new Date(t0), 'least-distance')).legs[0].lineId === 'LN7');
  mockFetch({ status: false, 'Error Message': 'No Path Found', message: '' });
  let noSvc = false;
  try {
    await planOnline('KG', 'DSTO', new Date(t0), 'least-distance');
  } catch (e) {
    noSvc = (e as Error).name === 'NoServiceError';
  }
  ok('No Path Found -> NoServiceError', noSvc);
  globalThis.fetch = realFetch;

  // ================= fares / service hours =================
  const off = planOffline('RCK', 'HCC', 'fastest')!;
  ok('offline Sunday fare', fareFor(off, IST('2026-11-15T10:00:00')) === off.fareSunday && off.fareSunday! < off.fare!);
  ok('before-first by own timetable', checkServiceHours(planOffline('AZU', 'MKPR', 'fastest')!, IST('2026-11-10T07:30:00'))?.kind === 'before-first');
  ok('after-last at 23:59', checkServiceHours(planOffline('RCK', 'KG', 'fastest')!, IST('2026-11-10T23:59:00'))?.kind === 'after-last');
  const pinkLeg = {
    from: 'AVIT',
    to: 'KKDC',
    legs: [
      {
        lineId: 'LN7',
        stations: ['AVIT', 'KKDA', 'KKDC'],
        towards: 'Maujpur-Babarpur',
        depart: '23:19:45',
        arrive: '23:23:00',
        durationS: 200,
        segS: [100, 100],
      },
    ],
    totalS: 200,
  } as unknown as Journey;
  ok('Pink on shared track not after-last at 23:10', checkServiceHours(pinkLeg, IST('2026-11-10T23:10:00'))?.kind !== 'after-last');
  const firstTrain = planOffline('RCK', 'PTCK', 'fastest')!;
  const at3 = IST('2026-11-10T03:00:00');
  ok(
    'offline start before service waits for the first train',
    plannedStart(firstTrain, at3) > at3 + 2 * 3600e3,
    new Date(plannedStart(firstTrain, at3)).toISOString(),
  );
  const timed = { ...firstTrain, legs: firstTrain.legs.map((l) => ({ ...l, depart: '05:30:00', arrive: '05:33:00' })) };
  ok('planner first train kept at 03:00', plannedStart(timed, at3) === IST('2026-11-10T05:30:00'));
  const late = { ...timed, legs: timed.legs.map((l) => ({ ...l, depart: '24:10:00', arrive: '24:13:00' })) };
  ok('24:xx timeline anchored once', Math.abs(buildTimeline(late, IST('2026-11-11T00:10:00'))[0].at - IST('2026-11-11T00:10:00')) < 1000);

  // ================= GPS-first trip engine =================
  await useTrip.persist.rehydrate();
  const rk = planOffline('RCK', 'KG', 'fastest')!; // Yellow, direct
  let pts = buildTimeline(rk, t0);

  // Sol #1: a fix at the origin 10 min after planned departure keeps realistic travel to the next stop
  setNow(t0 - 60e3);
  newTrip(rk, t0);
  await gps(at('RCK', t0 + 10 * 60e3));
  let p = computeProgress(T(), Date.now());
  ok('origin wait: next stop a real hop away', p.nextAt - Date.now() >= (pts[1].at - pts[0].dep) * 0.9, (p.nextAt - Date.now()) / 1000);
  ok('origin wait: still at origin 30 s later', computeProgress(T(), Date.now() + 30e3).idx === 0);

  // Origin before departure: waiting, delay unchanged (no pulling the trip earlier)
  setNow(t0 - 10 * 60e3);
  newTrip(rk, t0);
  await gps(at('RCK', t0 - 9 * 60e3));
  ok('early at origin keeps delay 0', T().delayMs === 0, T().delayMs);
  ok('waiting phase before departure', computeProgress(T(), Date.now()).phase === 'waiting');

  // Sol #7: 70-minute origin wait doesn't end the trip
  setNow(t0);
  newTrip(rk, t0);
  await gps(at('RCK', t0 + 70 * 60e3));
  ok('70-min wait: not arrived, at origin', !T().arrivedAt && computeProgress(T(), Date.now()).idx === 0);

  // Sol #2: after the clock ran ahead in a GPS gap, a fix back at an earlier station is accepted (2 agreeing fixes)
  setNow(t0);
  newTrip(rk, t0);
  const s1 = pts[1].code;
  await gps(at(rk.legs[0].stations[0], t0 + 5e3));
  // clock runs 20 min with no fixes -> far ahead
  setNow(t0 + 20 * 60e3);
  await tick();
  await gps(at(s1, t0 + 20 * 60e3 + 1e3));
  ok('GPS pulls a runaway clock back to the real station', computeProgress(T(), Date.now()).idx <= 1, computeProgress(T(), Date.now()).idx);

  // Opus #1: a stale cached fix far ahead is ignored; an implausible jump is ignored
  setNow(t0);
  newTrip(rk, t0);
  setNow(t0 + 30e3);
  await onFix({ ...at(pts[pts.length - 2].code, t0 - 20 * 60e3) });
  ok('stale cached fix ignored', !T().anchor && !T().arrivedAt);
  await gps(at(pts[pts.length - 1].code, t0 + 40e3));
  ok('impossible jump to the destination ignored', !T().arrivedAt && !T().anchor);

  // Sol #9: a precise fix 400 m off the route is not accepted (counted off-route instead)
  setNow(t0);
  newTrip(rk, t0);
  const rck = getStation('RCK');
  // ~400 m east of Rajiv Chowk; the Yellow Line runs north-south here
  await gps({ lat: rck.lat, lng: rck.lng + 0.0041, acc: 10, at: t0 + 60e3 });
  ok('400 m off route not accepted', !T().anchor && T().offRoute === 1, T().anchor);

  // Opus #4: repeated off-route fixes flag the trip
  for (let k = 2; k <= 3; k++) await gps({ lat: rck.lat, lng: rck.lng + 0.0045 * k, acc: 10, at: t0 + k * 60e3 });
  ok('off route flagged after 3 fixes', computeProgress(T(), Date.now()).offRoute);

  // Opus #2: timetable reaches the destination without GPS -> estimated, not arrived; later fix still works
  setNow(t0);
  newTrip(rk, t0);
  const eta = pts[pts.length - 1].at;
  setNow(eta + 2 * 60e3);
  await tick();
  ok('no arrival from clock alone at ETA', !T().arrivedAt && computeProgress(T(), Date.now()).estimated);
  await gps(at(pts[pts.length - 2].code, eta + 3 * 60e3));
  ok('late fix one stop before still accepted', T().anchor?.station === pts.length - 2 && !T().arrivedAt);
  await gps(at(pts[pts.length - 1].code, eta + 5 * 60e3));
  ok('fix at destination arrives', T().arrivedBy === 'gps');
  const arr = T().arrivedAt!;
  setNow(arr + 5 * 60e3);
  await tick();
  ok('kept 5 min after arrival (Sol #21 / Opus #5)', !!useTrip.getState().trip);
  setNow(arr + 11 * 60e3);
  await tick();
  ok('cleared 10 min after arrival', !useTrip.getState().trip);

  // Timetable gives up long after ETA; a later fix earlier on the route undoes it
  setNow(t0);
  newTrip(rk, t0);
  setNow(eta + 11 * 60e3);
  await tick();
  ok('timed-out arrival', T().arrivedBy === 'time');
  await gps(at(pts[pts.length - 2].code, eta + 11 * 60e3 + 5e3));
  await gps(at(pts[pts.length - 2].code, eta + 11 * 60e3 + 20e3));
  ok('fix undoes timed-out arrival', !T().arrivedAt, T().arrivedBy);

  // Opus P3: one backwards fix doesn't flicker; two do move back
  setNow(t0);
  newTrip(rk, t0);
  await gps(at(pts[3].code, t0 + pts[3].at - t0 + 5e3));
  const fwd = T().anchor!.idx;
  await gps(at(pts[1].code, Date.now() + 20e3));
  ok('single backwards fix ignored', T().anchor!.idx === fwd);
  await gps(at(pts[1].code, Date.now() + 20e3));
  ok('second backwards fix accepted', T().anchor!.idx === 1, [T().anchor, T().backPending, pts.map((q) => q.code)]);

  // Opus #13 / Sol r2: interchange walk keeps the plan on time; still there after departure -> late
  const ri = planOffline('RCK', 'RI', 'fastest')!; // Yellow -> Red at Kashmere Gate
  pts = buildTimeline(ri, t0);
  const xi = pts.findIndex((q) => q.transfer);
  ok('RCK->RI has an interchange with a walk window', xi > 0 && pts[xi].dep > pts[xi].at);
  setNow(t0);
  newTrip(ri, t0);
  for (let k = 1; k < xi; k++) await gps(at(pts[k].code, pts[k].at + 5e3));
  const before = T().delayMs;
  await gps(at(pts[xi].code, (pts[xi].at + pts[xi].dep) / 2));
  ok('interchange walk adds no delay', Math.abs(T().delayMs - before) < 10e3, [before, T().delayMs]);
  ok('"Change here" during the walk', computeProgress(T(), Date.now()).action.startsWith('Change here'));
  await gps(at(pts[xi].code, pts[xi].dep + 4 * 60e3));
  ok('still at interchange after departure -> late', T().delayMs >= 4 * 60e3 - 10e3, T().delayMs);
  ok('still "Change here" after missing the train', computeProgress(T(), Date.now()).action.startsWith('Change here'));

  // Live Activity milestone content (no background location)
  setNow(t0 + 30e3);
  newTrip(ri, t0, { tracking: 'foreground' });
  const ap = activityProps(T(), computeProgress(T(), Date.now()), Date.now());
  ok('milestone names the change', ap.title.startsWith('Change at Kashmere Gate'), ap.title);
  const direct = planOffline('RCK', 'PTCK', 'fastest')!;
  setNow(t0 - 10 * 60e3);
  newTrip(direct, t0, { tracking: 'foreground' });
  const aw = activityProps(T(), computeProgress(T(), Date.now()), Date.now());
  ok('waiting names where to get off', aw.title.startsWith('Train at') && aw.action.includes('Patel Chowk'), aw.action);

  // Manual correction at the destination = Done
  setNow(t0);
  newTrip(direct, t0);
  await setPosition(buildTimeline(direct, t0).length - 1);
  ok('"I\'m here" at destination arrives', T().arrivedBy === 'user');

  // Restore: expired trip is dropped with native cleanup
  setNow(t0);
  newTrip(direct, t0);
  setNow(t0 + 9 * 3600e3);
  await resumeTracking();
  ok('day-old trip dropped on restore', !useTrip.getState().trip);

  // ===== Sol review of #2 =====
  // 1. a point on the Janpath→Central Secretariat segment near Patel Chowk must not confirm arrival
  const jp = planOffline('JNPH', 'PTCK', 'fastest')!;
  const jpts = buildTimeline(jp, t0);
  ok(
    'JNPH->PTCK changes at Central Secretariat',
    jpts.some((q) => q.transfer && q.code === 'CTST'),
    jpts.map((q) => q.code),
  );
  setNow(t0);
  newTrip(jp, t0);
  await gps(at('JNPH', t0 + 5e3));
  await gps(between('JNPH', 'CTST', 0.23, t0 + 4 * 60e3));
  ok('near-but-not-on-route destination not confirmed', !T().arrivedAt && T().anchor?.station !== jpts.length - 1, T().anchor);

  // 2. rider already on board mid-route is placed after two consistent fixes
  const rh = planOffline('RCK', 'HCC', 'fastest')!;
  const rhp = buildTimeline(rh, t0);
  const mid = rhp[Math.floor(rhp.length / 2)].code;
  setNow(t0);
  newTrip(rh, t0);
  await gps(at(mid, t0 + 20e3));
  ok('first far fix held', !T().anchor);
  await gps(at(mid, t0 + 60e3));
  ok('second consistent fix places the rider', T().anchor?.station === Math.floor(rhp.length / 2), T().anchor);

  // 3. a trip that timed out and is resumed by GPS can show its Live Activity again
  setNow(t0);
  newTrip(rk, t0, { activityId: null, activityDismissed: false });
  pts = buildTimeline(rk, t0);
  setNow(pts.at(-1)!.at + 11 * 60e3);
  await tick();
  await gps(at(pts[pts.length - 2].code, Date.now() + 5e3));
  await gps(at(pts[pts.length - 2].code, Date.now() + 20e3));
  ok('resumed trip not marked dismissed', !T().arrivedAt && !T().activityDismissed, T());

  Date.now = realNow;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
