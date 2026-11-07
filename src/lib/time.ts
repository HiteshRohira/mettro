/**
 * Delhi Metro runs on India Standard Time (UTC+05:30, no DST). All service-day maths
 * goes through these helpers so results don't depend on the phone's timezone.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
/** Service day rolls over at 03:00 IST (last trains run a little past midnight). */
const SERVICE_DAY_START_H = 3;

export type IstParts = { y: number; mo: number; d: number; h: number; mi: number; s: number; dow: number };

export function istParts(ms: number): IstParts {
  const t = new Date(ms + IST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth(),
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    mi: t.getUTCMinutes(),
    s: t.getUTCSeconds(),
    dow: t.getUTCDay(),
  };
}

/** Epoch ms for an IST wall-clock time on the IST calendar date (y, mo, d). Hours may exceed 23. */
function istEpoch(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  return Date.UTC(y, mo, d, h, mi, s) - IST_OFFSET_MS;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DDTHH:MM:00.000" in IST — the format the DMRC planner expects. */
export function istIso(ms: number) {
  const p = istParts(ms);
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:00.000`;
}

/** "HH:MM" in IST. */
export function istClock(ms: number) {
  const p = istParts(ms);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** Day of week in IST (0 = Sunday). */
export function istDay(ms: number) {
  return istParts(ms).dow;
}

/** Parse "HH:MM[:SS]" (hours may be 24+) into seconds since midnight. */
export function hmsToSeconds(hms: string) {
  const [h, m, s] = hms.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

/**
 * Minutes into the service day for an instant (00:00–02:59 IST count as 24:00–26:59 of the
 * previous service day), so they compare correctly with first/last-train times.
 */
export function serviceMinutes(ms: number) {
  const p = istParts(ms);
  const m = p.h * 60 + p.mi;
  return p.h < SERVICE_DAY_START_H ? m + 24 * 60 : m;
}

/** Minutes for a timetable time like "05:48:01", "23:59" or "24:10:00" on the service-day scale. */
export function timetableMinutes(hms?: string | null) {
  if (!hms) return null;
  const sec = hmsToSeconds(hms);
  const m = Math.floor(sec / 60);
  return m < SERVICE_DAY_START_H * 60 ? m + 24 * 60 : m;
}

/**
 * Resolve a planner/timetable clock time to an epoch, relative to a reference instant.
 * The time is placed on the service day of `ref`; early-morning hours (< 03:00) and "24:xx"
 * belong to the night after. If that lands more than 6 h before `ref` it is taken as the next day
 * (e.g. asking at 02:00 for the 05:48 first train).
 */
export function clockToEpoch(hms: string, ref: number) {
  const sec = hmsToSeconds(hms);
  // service day of ref
  const sd = istParts(ref - SERVICE_DAY_START_H * 3600e3);
  let s = sec;
  if (s < SERVICE_DAY_START_H * 3600) s += 24 * 3600;
  let at = istEpoch(sd.y, sd.mo, sd.d, 0, 0, 0) + s * 1000;
  if (at < ref - 6 * 3600e3) at += 24 * 3600e3;
  return at;
}
