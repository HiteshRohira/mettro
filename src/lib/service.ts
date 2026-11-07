import { DIR_TIMINGS, getStation, titleTowards, type DirTiming } from '@/lib/network';
import type { Journey } from '@/lib/router';
import { clockToEpoch, serviceMinutes, timetableMinutes } from '@/lib/time';

export type ServiceIssue = {
  kind: 'after-last' | 'before-first' | 'near-last';
  station: string; // where you board that leg
  towards: string;
  timing: DirTiming;
  legIndex: number;
};

/**
 * Check every leg's boarding time against that direction's first/last train
 * (service-day minutes, IST — no hard-coded cut-offs).
 */
export function checkServiceHours(j: Journey, whenMs: number): ServiceIssue | null {
  let t = whenMs;
  let worst: ServiceIssue | null = null;
  for (let li = 0; li < j.legs.length; li++) {
    const leg = j.legs[li];
    const board = leg.depart ? clockToEpoch(leg.depart, whenMs) : t;
    const timing = DIR_TIMINGS[`${leg.stations[0]}|${leg.stations[1]}`];
    t = board + leg.durationS * 1000 + (li < j.legs.length - 1 ? 5 * 60e3 : 0);
    if (!timing) continue;
    const m = serviceMinutes(board);
    const first = timetableMinutes(timing.first);
    const last = timetableMinutes(timing.last);
    const base = { station: getStation(leg.stations[0]).name, towards: titleTowards(timing.to) || leg.towards, timing, legIndex: li };
    if (last != null && m > last) return { kind: 'after-last', ...base };
    if (first != null && m < first) return { kind: 'before-first', ...base };
    if (!worst && last != null && m >= last - 45) worst = { kind: 'near-last', ...base };
  }
  return worst;
}
