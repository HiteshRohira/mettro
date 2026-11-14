import { File, Paths } from 'expo-file-system';
import { AppState, Platform, Share } from 'react-native';

import { useSettings } from '@/store/settings';

/**
 * Developer trip log: one JSON object per line, kept on the device until the owner shares it
 * (More → tap the version → Developer). It records every raw location fix and what the trip engine
 * did with it, so real rides — underground ones especially — can be replayed afterwards.
 * Off unless switched on; nothing is ever sent anywhere by the app itself.
 */
const FILE_NAME = 'mettro-trip-log.txt';
/** Roughly 15 hours of riding. Past this the log starts over. */
const MAX_BYTES = 8 * 1024 * 1024;
const FLUSH_MS = 3000;
const FLUSH_LINES = 40;

let buffer: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();

const file = () => new File(Paths.document, FILE_NAME);

export const debugLogOn = () => useSettings.getState().debugLog;

/** Round coordinates to ~1 m: plenty for a metro, and keeps lines short. */
export const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Append an event. `e` names it; keep `data` flat and small. */
export function logEvent(e: string, data: Record<string, unknown> = {}) {
  if (!debugLogOn()) return;
  try {
    buffer.push(JSON.stringify({ t: Date.now(), e, ...data }));
  } catch {
    return;
  }
  if (buffer.length >= FLUSH_LINES) flushLog();
  else timer ??= setTimeout(flushLog, FLUSH_MS);
}

export function flushLog() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!buffer.length) return writing;
  const text = buffer.join('\n') + '\n';
  buffer = [];
  writing = writing.then(async () => {
    try {
      const f = file();
      if (f.exists && (f.size ?? 0) > MAX_BYTES) f.delete();
      if (!f.exists) f.create();
      await f.write(text, { append: true });
    } catch (err) {
      console.warn('debug log', err);
    }
  });
  return writing;
}

export function logSize() {
  try {
    const f = file();
    return f.exists ? (f.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export async function clearLog() {
  buffer = [];
  await writing;
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {}
}

/** Open the system share sheet with the log. Returns false when there's nothing to share. */
export async function shareLog() {
  await flushLog();
  const f = file();
  if (!f.exists || !f.size) return false;
  if (Platform.OS === 'ios') {
    await Share.share({ url: f.uri });
  } else {
    // Android's share sheet takes text, not a file: send the most recent part
    const text = await f.text();
    await Share.share({ title: FILE_NAME, message: text.slice(-400_000) });
  }
  return true;
}

// Don't lose the tail when the app is backgrounded or about to be suspended.
AppState.addEventListener('change', (s) => {
  logEvent('app', { state: s });
  if (s !== 'active') flushLog();
});
