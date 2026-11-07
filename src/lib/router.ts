import { DIR_TIMINGS, EDGES, getLine, getStation, lineById, titleTowards, type Line } from '@/lib/network';
import { estimateFare } from '@/lib/fare';

export type Leg = {
  lineId: string;
  stations: string[]; // codes incl. start and end
  towards: string; // display name of terminal
  platform?: string | null;
  depart?: string | null; // HH:MM:SS
  arrive?: string | null;
  durationS: number;
  segS: number[]; // per hop seconds, length = stations.length-1
};

export type Journey = {
  id: string;
  from: string;
  to: string;
  legs: Leg[];
  totalS: number;
  stops: number;
  interchanges: number;
  fare: number | null;
  fareSunday?: number | null;
  fareSource: 'dmrc' | 'estimate';
  source: 'dmrc' | 'offline';
  mode: 'fastest' | 'fewest-changes';
  queriedAt: number;
  km: number;
};

const DWELL = 0; // planner edge times already include dwell
const INTERCHANGE_S = 6 * 60; // walk + wait estimate

// adjacency per (station,line)
type Arc = { to: string; line: string; s: number; km: number };
const adj = new Map<string, Arc[]>();
for (const e of EDGES) {
  const s = e.s;
  (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push({ to: e.b, line: e.line, s, km: e.km });
  (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push({ to: e.a, line: e.line, s, km: e.km });
}

/** Blue LN3/LN4 & Pink/Magenta extensions are through-running in practice: treat as same "colour" for transfer penalties */
const colourGroup = (lineId: string) => {
  const l = lineById.get(lineId)!;
  if (lineId === 'LN7EXTN') return 'LN7';
  if (lineId === 'LN8EXTN') return 'LN8';
  return l.id;
};

class Heap<T> {
  private a: { k: number; v: T }[] = [];
  push(k: number, v: T) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

/** Direction terminal on a line when travelling a -> b */
export function towardsFor(lineId: string, a: string, b: string): string {
  const t = DIR_TIMINGS[`${a}|${b}`];
  if (t?.to) return titleTowards(t.to);
  const l = getLine(lineId);
  const seqs = [l.stations, ...l.branches];
  for (const seq of seqs) {
    const ia = seq.indexOf(a);
    const ib = seq.indexOf(b);
    if (ia >= 0 && ib >= 0) {
      const end = ib > ia ? seq[seq.length - 1] : seq[0];
      return getStation(end).name;
    }
  }
  return getStation(l.end_code ?? b).name;
}

export function planOffline(from: string, to: string, mode: Journey['mode'] = 'fastest'): Journey | null {
  if (from === to) return null;
  const penalty = mode === 'fewest-changes' ? 40 * 60 : INTERCHANGE_S;
  // state key: station|lineGroup
  const dist = new Map<string, number>();
  const prev = new Map<string, { key: string; line: string; s: number } | null>();
  const h = new Heap<{ st: string; line: string | null; key: string }>();
  const startKey = `${from}|*`;
  dist.set(startKey, 0);
  prev.set(startKey, null);
  h.push(0, { st: from, line: null, key: startKey });
  let goal: string | null = null;
  while (h.size) {
    const { k, v } = h.pop()!;
    if (k > (dist.get(v.key) ?? Infinity)) continue;
    if (v.st === to) {
      goal = v.key;
      break;
    }
    for (const arc of adj.get(v.st) ?? []) {
      const g = colourGroup(arc.line);
      const switching = v.line !== null && v.line !== g;
      const cost = k + arc.s + DWELL + (switching ? penalty : 0);
      const key = `${arc.to}|${g}`;
      if (cost < (dist.get(key) ?? Infinity)) {
        dist.set(key, cost);
        prev.set(key, { key: v.key, line: arc.line, s: arc.s });
        h.push(cost, { st: arc.to, line: g, key });
      }
    }
  }
  if (!goal) return null;
  // reconstruct hops
  const hops: { a: string; b: string; line: string; s: number }[] = [];
  let cur = goal;
  while (prev.get(cur)) {
    const p = prev.get(cur)!;
    hops.push({ a: p.key.split('|')[0], b: cur.split('|')[0], line: p.line, s: p.s });
    cur = p.key;
  }
  hops.reverse();
  return journeyFromHops(from, to, hops, mode);
}

function journeyFromHops(from: string, to: string, hops: { a: string; b: string; line: string; s: number }[], mode: Journey['mode']): Journey {
  const legs: Leg[] = [];
  for (const hop of hops) {
    const last = legs[legs.length - 1];
    const sameRun =
      last &&
      colourGroup(last.lineId) === colourGroup(hop.line) &&
      !(last.lineId === 'LN3' && hop.line === 'LN4') &&
      !(last.lineId === 'LN4' && hop.line === 'LN3');
    if (sameRun) {
      last.stations.push(hop.b);
      last.segS.push(hop.s + DWELL);
      last.durationS += hop.s + DWELL;
    } else {
      legs.push({
        lineId: hop.line,
        stations: [hop.a, hop.b],
        towards: towardsFor(hop.line, hop.a, hop.b),
        platform: DIR_TIMINGS[`${hop.a}|${hop.b}`]?.platform ?? null,
        durationS: hop.s + DWELL,
        segS: [hop.s + DWELL],
      });
    }
  }
  const km = hops.reduce((acc, h) => acc + (adj.get(h.a)?.find((x) => x.to === h.b)?.km ?? 0), 0);
  const interchanges = Math.max(0, legs.length - 1);
  const totalS = legs.reduce((a, l) => a + l.durationS, 0) + interchanges * INTERCHANGE_S;
  const fare = estimateFare(legs, km);
  return {
    id: `off-${mode}-${from}-${to}`,
    from,
    to,
    legs,
    totalS,
    stops: hops.length,
    interchanges,
    fare: fare.normal,
    fareSunday: fare.sunday,
    fareSource: 'estimate',
    source: 'offline',
    mode,
    queriedAt: Date.now(),
    km,
  };
}

export function lineOfLeg(leg: Leg): Line {
  return getLine(leg.lineId);
}

/** Flatten a journey into the station sequence with cumulative seconds from departure. */
export function journeyTimeline(j: Journey) {
  const pts: { code: string; legIndex: number; t: number; isTransfer: boolean }[] = [];
  let t = 0;
  j.legs.forEach((leg, li) => {
    leg.stations.forEach((code, si) => {
      if (si === 0 && li > 0) {
        // transfer station already added as end of previous leg
        t += INTERCHANGE_S;
        pts[pts.length - 1].isTransfer = true;
        return;
      }
      if (si > 0) t += leg.segS[si - 1] ?? 120;
      pts.push({ code, legIndex: li, t, isTransfer: false });
    });
  });
  return pts;
}

export const INTERCHANGE_SECONDS = INTERCHANGE_S;
