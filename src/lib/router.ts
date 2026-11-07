import { dirTiming, EDGES, getLine, getStation, lineById, titleTowards } from '@/lib/network';
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

const INTERCHANGE_S = 6 * 60; // walk + wait estimate

// adjacency per (station,line)
type Arc = { to: string; line: string; s: number; km: number };
const adj = new Map<string, Arc[]>();
for (const e of EDGES) {
  const s = e.s;
  (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push({ to: e.b, line: e.line, s, km: e.km });
  // one-way edges (Rapid Metro loop) only run a -> b
  if (!e.oneway) (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push({ to: e.a, line: e.line, s, km: e.km });
}

// Blue Line: trains run Dwarka ⇄ Noida and Dwarka ⇄ Vaishali through Yamuna Bank, so the
// west section continues onto either branch, but Noida ⇄ Vaishali needs a change at Yamuna Bank.
const LN3_SEQ = lineById.get('LN3')?.stations ?? [];
const YB_IDX = LN3_SEQ.indexOf('YB'); // LN3 runs Noida (index 0) → Dwarka

/** Ride group of a hop: hops in groups that run through each other need no change. */
function hopGroup(line: string, a: string, b: string) {
  if (line === 'LN3' && YB_IDX >= 0) return Math.max(LN3_SEQ.indexOf(a), LN3_SEQ.indexOf(b)) <= YB_IDX ? 'LN3E' : 'LN3W';
  if (line === 'LN7EXTN') return 'LN7';
  if (line === 'LN8EXTN') return 'LN8';
  return line;
}

/** Does going from a hop in group g1 to a hop in group g2 require changing trains? */
function isTransfer(g1: string, g2: string) {
  if (g1 === g2) return false;
  const pair = [g1, g2].sort().join('+');
  return pair !== 'LN3E+LN3W' && pair !== 'LN3W+LN4';
}

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
  const t = dirTiming(a, b, lineId);
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
  // state key: station|rideGroup|previousStation (the previous station forbids U-turns, which
  // could otherwise dodge a required change, e.g. Yamuna Bank → Indraprastha → Yamuna Bank)
  const dist = new Map<string, number>();
  const prev = new Map<string, { key: string; line: string; s: number } | null>();
  const h = new Heap<{ st: string; line: string | null; key: string; from: string | null }>();
  const startKey = `${from}|*|`;
  dist.set(startKey, 0);
  prev.set(startKey, null);
  h.push(0, { st: from, line: null, key: startKey, from: null });
  let goal: string | null = null;
  while (h.size) {
    const { k, v } = h.pop()!;
    if (k > (dist.get(v.key) ?? Infinity)) continue;
    if (v.st === to) {
      goal = v.key;
      break;
    }
    for (const arc of adj.get(v.st) ?? []) {
      if (arc.to === v.from) continue;
      const g = hopGroup(arc.line, v.st, arc.to);
      const switching = v.line !== null && isTransfer(v.line, g);
      const cost = k + arc.s + (switching ? penalty : 0);
      const key = `${arc.to}|${g}|${v.st}`;
      if (cost < (dist.get(key) ?? Infinity)) {
        dist.set(key, cost);
        prev.set(key, { key: v.key, line: arc.line, s: arc.s });
        h.push(cost, { st: arc.to, line: g, key, from: v.st });
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
  let lastGroup: string | null = null;
  for (const hop of hops) {
    const last = legs[legs.length - 1];
    const g = hopGroup(hop.line, hop.a, hop.b);
    const sameRun = last && lastGroup !== null && !isTransfer(lastGroup, g);
    lastGroup = g;
    if (sameRun) {
      last.stations.push(hop.b);
      last.segS.push(hop.s);
      last.durationS += hop.s;
      // a through-running ride is signed with its final destination (e.g. Blue → Vaishali)
      last.towards = towardsFor(hop.line, hop.a, hop.b);
    } else {
      legs.push({
        lineId: hop.line,
        stations: [hop.a, hop.b],
        towards: towardsFor(hop.line, hop.a, hop.b),
        platform: dirTiming(hop.a, hop.b, hop.line)?.platform ?? null,
        durationS: hop.s,
        segS: [hop.s],
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

export const INTERCHANGE_SECONDS = INTERCHANGE_S;
