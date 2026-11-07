export function fmtDuration(totalS: number) {
  const m = Math.max(1, Math.round(totalS / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtClock(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "05:48:01" -> "05:48"; "24:12:00" -> "00:12" */
export function hm(s?: string | null) {
  if (!s) return '—';
  const [h, m] = s.split(':');
  const hh = Number(h) % 24;
  return `${pad(hh)}:${m}`;
}

export function hmToMinutes(s?: string | null) {
  if (!s) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export function ago(ms: number | null | undefined) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function fmtKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function walkMin(km: number) {
  return Math.max(1, Math.round((km * 1.2 * 60) / 5));
}
