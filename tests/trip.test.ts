process.env.TZ = process.env.TZ || 'Asia/Kolkata';
import { buildTimeline, computeProgress, onFix, plannedStart, setPosition, tick } from '@/lib/trip';
import { planOffline } from '@/lib/router';
import { useTrip } from '@/store/trip';
import { getStation, linesBetween } from '@/lib/network';
import { clockToEpoch, istIso, serviceMinutes, timetableMinutes } from '@/lib/time';
import { fareFor } from '@/lib/fare';
import { checkServiceHours } from '@/lib/service';
import { isNormal } from '@/store/status';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, info?: unknown) => { if (cond) pass++; else { fail++; console.log('FAIL', name, info ?? ''); } };
const IST = (s: string) => Date.parse(s + '+05:30');
const realNow = Date.now;
const setNow = (t: number) => { Date.now = () => t; };

function newTrip(j: any, startedAt: number) {
  useTrip.getState().setTrip({ journey: j, startedAt, delayMs: 0, anchorIdx: 0, anchorAt: null, lastFix: null, activityId: null, activityDismissed: false, arrivedAt: null });
}
const fixAt = (code: string, at: number) => ({ lat: getStation(code).lat, lng: getStation(code).lng, acc: 10, at });

(async () => {
  // --- time helpers (independent of TZ)
  ok('istIso', istIso(IST('2026-11-10T15:30:00')) === '2026-11-10T15:30:00.000', istIso(IST('2026-11-10T15:30:00')));
  ok('24:10 next day', clockToEpoch('24:10:00', IST('2026-11-10T23:59:00')) === IST('2026-11-11T00:10:00'));
  ok('00:10 after midnight ref', clockToEpoch('00:10:00', IST('2026-11-11T00:05:00')) === IST('2026-11-11T00:10:00'));
  ok('first train asked at 02:00', clockToEpoch('05:48:00', IST('2026-11-11T02:00:00')) === IST('2026-11-11T05:48:00'));
  ok('serviceMinutes 00:30 > 23:00', serviceMinutes(IST('2026-11-11T00:30:00')) > timetableMinutes('23:00')!);
  ok('isNormal', isNormal('Normal Service') && !isNormal('Not normal') && !isNormal('Partial Service'));

  // --- router: one-way loop + shared stretch + Blue through-running
  const bel = planOffline('BEL', 'DL2', 'fastest')!;
  ok('rapid one-way BEL->DL2 goes round loop', bel.stops > 1, bel.legs.map((l) => l.stations));
  ok('AVIT-KKDA shared', linesBetween('AVIT', 'KKDA').length === 2, linesBetween('AVIT', 'KKDA'));
  const vas = planOffline('RCK', 'VASI', 'fastest')!;
  ok('RCK->VASI single blue leg towards Vaishali', vas.legs.length === 1 && vas.legs[0].towards === 'Vaishali', vas.legs.map((l) => [l.lineId, l.towards]));

  // --- fares offline on Sunday
  const off = planOffline('RCK', 'HCC', 'fastest')!;
  ok('sunday fare offline', fareFor(off, IST('2026-11-15T10:00:00')) === off.fareSunday && off.fareSunday! < off.fare!, [off.fare, off.fareSunday]);

  // --- trip: origin wait does not pull the trip early (Opus #1)
  const j = planOffline('RCK', 'KG', 'fastest')!;
  const t0 = IST('2026-11-10T10:00:00');
  newTrip(j, t0 + 10 * 60e3); // train in 10 min
  setNow(t0); await onFix(fixAt('RCK', t0));
  ok('origin wait keeps delay 0', useTrip.getState().trip!.delayMs === 0, useTrip.getState().trip!.delayMs);
  ok('phase waiting before departure', computeProgress(useTrip.getState().trip!, t0).phase === 'waiting');
  setNow(t0 + 15 * 60e3);
  ok('5 min after departure, ~2 stops, not 4', computeProgress(useTrip.getState().trip!, t0 + 15 * 60e3).idx <= 2);

  // --- Sol #1/#2: still at origin with fresh fixes -> ticks don't advance; GPS pulls back
  const j2 = planOffline('RCK', 'KG', 'fastest')!;
  newTrip(j2, t0);
  for (let k = 1; k <= 4; k++) { const t = t0 + k * 3 * 60e3; setNow(t); await onFix(fixAt('RCK', t)); await tick(); }
  let tr = useTrip.getState().trip!;
  ok('origin fixes: stays at origin (idx<=1)', computeProgress(tr, Date.now()).idx <= 1, computeProgress(tr, Date.now()).idx);
  ok('origin fixes: delay grows', tr.delayMs >= 9 * 60e3, tr.delayMs);
  ok('origin fixes: not arrived', !tr.arrivedAt);

  // --- timetable arrival needs grace; late fix undoes arrival; retention 10 min (Sol #14)
  const j3 = planOffline('RCK', 'PTCK', 'fastest')!;
  newTrip(j3, t0);
  const pts = buildTimeline(j3, t0);
  const eta = pts[pts.length - 1].at;
  setNow(eta + 30e3); await tick();
  ok('no arrival before grace', !useTrip.getState().trip!.arrivedAt);
  setNow(eta + 3 * 60e3); await tick();
  ok('arrival after grace', !!useTrip.getState().trip!.arrivedAt);
  await onFix(fixAt('RCK', eta + 3 * 60e3 + 1000));
  ok('earlier-station fix undoes arrival', !useTrip.getState().trip!.arrivedAt, useTrip.getState().trip);
  await onFix(fixAt('PTCK', eta + 5 * 60e3));
  const arrivedAt = useTrip.getState().trip!.arrivedAt!;
  setNow(arrivedAt + 5 * 60e3); await tick();
  ok('kept 5 min after arrival', !!useTrip.getState().trip);
  setNow(arrivedAt + 11 * 60e3); await tick();
  ok('cleared after 10 min', !useTrip.getState().trip);

  // --- before service (Sol #5): plannedStart keeps a 05:30 departure at 03:00
  const jj: any = { ...planOffline('RCK', 'PTCK', 'fastest')!, legs: planOffline('RCK', 'PTCK', 'fastest')!.legs.map((l) => ({ ...l, depart: '05:30:00', arrive: '05:33:00' })) };
  const at3 = IST('2026-11-10T03:00:00');
  ok('plannedStart keeps future first train', plannedStart(jj, at3) === IST('2026-11-10T05:30:00'), new Date(plannedStart(jj, at3)).toISOString());

  // --- 24:xx timeline (Sol #10)
  const jm: any = { ...jj, legs: jj.legs.map((l: any) => ({ ...l, depart: '24:10:00', arrive: '24:13:00' })) };
  const start = IST('2026-11-11T00:10:00');
  const tl = buildTimeline(jm, start);
  ok('24:xx timeline anchored at start', Math.abs(tl[0].at - start) < 1000, new Date(tl[0].at).toISOString());

  // --- setPosition back to active resumes (no throw) & clears arrival
  newTrip(j3, t0); setNow(t0 + 60e3); await setPosition(0);
  ok('setPosition origin', useTrip.getState().trip!.anchorIdx === 0 && !useTrip.getState().trip!.arrivedAt);

  // --- service hours per leg, no hard-coded cut-offs
  const sh = checkServiceHours(planOffline('AZU', 'MKPR', 'fastest')!, IST('2026-11-10T07:30:00'));
  ok('before-first at 07:30 when first train is 07:55', sh?.kind === 'before-first', sh);
  const late = checkServiceHours(planOffline('RCK', 'KG', 'fastest')!, IST('2026-11-10T23:59:00'));
  ok('after-last at 23:59', late?.kind === 'after-last', late);

  Date.now = realNow;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
