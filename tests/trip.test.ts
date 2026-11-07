process.env.TZ = process.env.TZ || 'Asia/Kolkata';
import { activityProps, buildTimeline, computeProgress, onFix, plannedStart, resumeTracking, setPosition, tick } from '@/lib/trip';
import { planOnline } from '@/lib/api';
import { planOffline } from '@/lib/router';
import { useTrip } from '@/store/trip';
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

function newTrip(j: any, startedAt: number) {
  useTrip
    .getState()
    .setTrip({ journey: j, startedAt, delayMs: 0, anchorIdx: 0, anchorAt: null, lastFix: null, activityId: null, activityDismissed: false, arrivedAt: null });
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
  ok(
    'rapid one-way BEL->DL2 goes round loop',
    bel.stops > 1,
    bel.legs.map((l) => l.stations),
  );
  ok('AVIT-KKDA shared', linesBetween('AVIT', 'KKDA').length === 2, linesBetween('AVIT', 'KKDA'));
  const vas = planOffline('RCK', 'VASI', 'fastest')!;
  ok(
    'RCK->VASI single blue leg towards Vaishali',
    vas.legs.length === 1 && vas.legs[0].towards === 'Vaishali',
    vas.legs.map((l) => [l.lineId, l.towards]),
  );

  // --- fares offline on Sunday
  const off = planOffline('RCK', 'HCC', 'fastest')!;
  ok('sunday fare offline', fareFor(off, IST('2026-11-15T10:00:00')) === off.fareSunday && off.fareSunday! < off.fare!, [off.fare, off.fareSunday]);

  // --- trip: origin wait does not pull the trip early (Opus #1)
  const j = planOffline('RCK', 'KG', 'fastest')!;
  const t0 = IST('2026-11-10T10:00:00');
  newTrip(j, t0 + 10 * 60e3); // train in 10 min
  setNow(t0);
  await onFix(fixAt('RCK', t0));
  ok('origin wait keeps delay 0', useTrip.getState().trip!.delayMs === 0, useTrip.getState().trip!.delayMs);
  ok('phase waiting before departure', computeProgress(useTrip.getState().trip!, t0).phase === 'waiting');
  setNow(t0 + 15 * 60e3);
  ok('5 min after departure, ~2 stops, not 4', computeProgress(useTrip.getState().trip!, t0 + 15 * 60e3).idx <= 2);

  // --- Sol #1/#2: still at origin with fresh fixes -> ticks don't advance; GPS pulls back
  const j2 = planOffline('RCK', 'KG', 'fastest')!;
  newTrip(j2, t0);
  for (let k = 1; k <= 4; k++) {
    const t = t0 + k * 3 * 60e3;
    setNow(t);
    await onFix(fixAt('RCK', t));
    await tick();
  }
  let tr = useTrip.getState().trip!;
  ok('origin fixes: stays at origin (idx<=1)', computeProgress(tr, Date.now()).idx <= 1, computeProgress(tr, Date.now()).idx);
  ok('origin fixes: delay grows', tr.delayMs >= 9 * 60e3, tr.delayMs);
  ok('origin fixes: not arrived', !tr.arrivedAt);

  // --- timetable arrival needs grace; late fix undoes arrival; retention 10 min (Sol #14)
  const j3 = planOffline('RCK', 'PTCK', 'fastest')!;
  newTrip(j3, t0);
  const pts = buildTimeline(j3, t0);
  const eta = pts[pts.length - 1].at;
  setNow(eta + 30e3);
  await tick();
  ok('no arrival before grace', !useTrip.getState().trip!.arrivedAt);
  setNow(eta + 3 * 60e3);
  await tick();
  ok('arrival after grace', !!useTrip.getState().trip!.arrivedAt);
  await onFix(fixAt('RCK', eta + 3 * 60e3 + 1000));
  ok('earlier-station fix undoes arrival', !useTrip.getState().trip!.arrivedAt, useTrip.getState().trip);
  await onFix(fixAt('PTCK', eta + 5 * 60e3));
  const arrivedAt = useTrip.getState().trip!.arrivedAt!;
  setNow(arrivedAt + 5 * 60e3);
  await tick();
  ok('kept 5 min after arrival', !!useTrip.getState().trip);
  setNow(arrivedAt + 11 * 60e3);
  await tick();
  ok('cleared after 10 min', !useTrip.getState().trip);

  // --- before service (Sol #5): plannedStart keeps a 05:30 departure at 03:00
  const jj: any = {
    ...planOffline('RCK', 'PTCK', 'fastest')!,
    legs: planOffline('RCK', 'PTCK', 'fastest')!.legs.map((l) => ({ ...l, depart: '05:30:00', arrive: '05:33:00' })),
  };
  const at3 = IST('2026-11-10T03:00:00');
  ok('plannedStart keeps future first train', plannedStart(jj, at3) === IST('2026-11-10T05:30:00'), new Date(plannedStart(jj, at3)).toISOString());

  // --- 24:xx timeline (Sol #10)
  const jm: any = { ...jj, legs: jj.legs.map((l: any) => ({ ...l, depart: '24:10:00', arrive: '24:13:00' })) };
  const start = IST('2026-11-11T00:10:00');
  const tl = buildTimeline(jm, start);
  ok('24:xx timeline anchored at start', Math.abs(tl[0].at - start) < 1000, new Date(tl[0].at).toISOString());

  // --- setPosition back to active resumes (no throw) & clears arrival
  newTrip(j3, t0);
  setNow(t0 + 60e3);
  await setPosition(0);
  ok('setPosition origin', useTrip.getState().trip!.anchorIdx === 0 && !useTrip.getState().trip!.arrivedAt);

  // --- service hours per leg, no hard-coded cut-offs
  const sh = checkServiceHours(planOffline('AZU', 'MKPR', 'fastest')!, IST('2026-11-10T07:30:00'));
  ok('before-first at 07:30 when first train is 07:55', sh?.kind === 'before-first', sh);
  const late = checkServiceHours(planOffline('RCK', 'KG', 'fastest')!, IST('2026-11-10T23:59:00'));
  ok('after-last at 23:59', late?.kind === 'after-last', late);

  // ===== Round 2 (Sol review of PR #1) =====
  // 1. Blue branch: Vaishali -> Noida needs a change at Yamuna Bank; Dwarka <-> Vaishali / Noida run through
  const vn = planOffline('VASI', 'NSET', 'fastest')!;
  ok(
    'VASI->NSET changes at YB',
    vn.legs.length === 2 && vn.legs[0].stations.at(-1) === 'YB',
    vn.legs.map((l) => [l.lineId, l.stations[0], l.stations.at(-1), l.towards]),
  );
  const dv = planOffline('DSTO', 'VASI', 'fewest-changes')!;
  ok(
    'DSTO->VASI through-runs',
    dv.legs.length === 1 && dv.legs[0].towards === 'Vaishali',
    dv.legs.map((l) => [l.lineId, l.towards]),
  );
  const dn = planOffline('DSTO', 'NECC', 'fewest-changes')!;
  ok(
    'DSTO->NECC single leg',
    dn.legs.length === 1,
    dn.legs.map((l) => l.lineId),
  );

  // 2. first fix mid-way through a planned interchange walk keeps an on-time trip on time
  const ri = planOffline('RCK', 'RI', 'fastest')!;
  newTrip(ri, t0);
  const rtl = buildTimeline(ri, t0);
  const xi = rtl.findIndex((p) => p.transfer);
  ok(
    'RCK->RI has an interchange',
    xi > 0,
    ri.legs.map((l) => l.lineId),
  );
  const mid = rtl[xi].at + (rtl[xi].dep - rtl[xi].at) / 2;
  setNow(mid);
  await onFix(fixAt(rtl[xi].code, mid));
  ok('interchange walk adds no delay', Math.abs(useTrip.getState().trip!.delayMs) < 1000, useTrip.getState().trip!.delayMs);
  const lateAt = rtl[xi].dep + 4 * 60e3;
  setNow(lateAt);
  await onFix(fixAt(rtl[xi].code, lateAt));
  ok('still at interchange after its departure => late', useTrip.getState().trip!.delayMs >= 4 * 60e3 - 1000, useTrip.getState().trip!.delayMs);

  // 3. impossible planner leg times fall back to network hop times (mocked DMRC response)
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        stations: 2,
        total_time: '0:00:02',
        fare: 11,
        route: [
          {
            line: 'Pink Line',
            line_no: 7,
            path: [{ name: 'BURARI' }, { name: 'MAJLIS PARK' }],
            'map-path': ['BURI-MKPR'],
            path_time: '0:00:02',
            towards_station: 'MAJLIS PARK',
            platform_name: 'Platform No. 1',
            new_start_time: '12:03:50',
            new_end_time: '11:45:06',
          },
        ],
      }),
    )) as any;
  const bm = await planOnline('BURI', 'MKPR', new Date(IST('2026-11-10T12:00:00')), 'least-distance');
  globalThis.fetch = realFetch;
  ok('2-second planner leg replaced', bm.totalS > 120 && bm.legs[0].segS[0] > 120, [bm.totalS, bm.legs[0].segS]);
  ok('bad planner arrival dropped', bm.legs[0].arrive === null);

  // 4. service hours use the leg's own line on shared track (Pink AVIT->KKDC at 23:10 is fine)
  const pinkLeg: any = {
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
  };
  const pk = checkServiceHours(pinkLeg, IST('2026-11-10T23:10:00'));
  ok('Pink on shared track not after-last', pk?.kind !== 'after-last', pk);

  // 5. without background location the Live Activity shows milestones (valid while suspended)
  const ms = planOffline('RCK', 'RI', 'fastest')!;
  newTrip(ms, t0);
  useTrip.getState().patch({ tracking: 'foreground' });
  setNow(t0 + 30e3);
  const ap = activityProps(useTrip.getState().trip!, computeProgress(useTrip.getState().trip!, t0 + 30e3));
  ok('milestone title names the change', ap.title.startsWith('Change at Kashmere Gate'), ap.title);
  useTrip.getState().patch({ tracking: 'background' });
  const ap2 = activityProps(useTrip.getState().trip!, computeProgress(useTrip.getState().trip!, t0 + 30e3));
  ok('background tracking shows next station', ap2.title.startsWith('Next:'), ap2.title);

  // 6. resuming with no trip cleans up without throwing
  useTrip.getState().setTrip(null);
  await resumeTracking();
  ok('resume with no trip ok', true);

  // ===== Round 3 (Sol re-review) =====
  // 1. impossible planner clock span is discarded too (not just path_time)
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        stations: 2,
        total_time: '0:00:02',
        fare: 11,
        route: [
          {
            line: 'Pink Line',
            line_no: 7,
            path: [{ name: 'BURARI' }, { name: 'MAJLIS PARK' }],
            'map-path': ['BURI-MKPR'],
            path_time: '0:00:02',
            towards_station: 'MAJLIS PARK',
            platform_name: 'Platform No. 1',
            new_start_time: '12:03:50',
            new_end_time: '12:03:52',
          },
        ],
      }),
    )) as any;
  const bm2 = await planOnline('BURI', 'MKPR', new Date(IST('2026-11-10T12:00:00')), 'least-distance');
  globalThis.fetch = realFetch;
  const bt = buildTimeline(bm2, IST('2026-11-10T12:03:50'));
  ok('2 s clock span rejected', bm2.totalS > 120 && bt[bt.length - 1].at - bt[0].at > 120e3, [bm2.totalS, bm2.legs[0].arrive]);

  // 2. milestone mode keeps "change here" during the interchange walk
  const rr = planOffline('RCK', 'RI', 'fastest')!;
  newTrip(rr, t0);
  useTrip.getState().patch({ tracking: 'foreground' });
  const rtl2 = buildTimeline(rr, t0);
  const x2 = rtl2.findIndex((p) => p.transfer);
  const inWalk = rtl2[x2].at + 60e3;
  const pw = computeProgress(useTrip.getState().trip!, inWalk);
  const aw = activityProps(useTrip.getState().trip!, pw, inWalk);
  ok('walk: change instruction kept', aw.title.startsWith('Change here') && aw.action.includes('Red Line'), [aw.title, aw.action]);
  ok('walk: countdown to onward train', aw.nextAt === Math.round(rtl2[x2].dep), [aw.nextAt, rtl2[x2].dep]);

  // 3. waiting in milestone mode mentions the change and expires at departure
  newTrip(rr, t0 + 10 * 60e3);
  useTrip.getState().patch({ tracking: 'foreground' });
  const pwt = computeProgress(useTrip.getState().trip!, t0);
  const awt = activityProps(useTrip.getState().trip!, pwt, t0);
  ok('waiting mentions change', awt.title.startsWith('Train at') && awt.action.includes('change at Kashmere Gate'), awt.action);

  Date.now = realNow;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
