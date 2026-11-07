import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { fetchStationCount } from '@/lib/api';
import { whenHydrated } from '@/lib/hydration';
import { directionsAt, getStation, lineLabel, STATIONS } from '@/lib/network';
import { useSettings } from '@/store/settings';
import { disruptedLines, useStatus } from '@/store/status';
import StatusWidget from '@/widgets/StatusWidget';

/**
 * Silent background refresh — no notifications.
 * Routes, timings and fares are always fetched live from DMRC when you plan a trip;
 * this keeps the line status, the home-screen widget and the "new stations" check fresh.
 */
export const REFRESH_TASK = 'mettro-data-refresh';

/** First/last train summary for the user's home (or first saved) station. */
export function homeTimingSummary(): { station: string; text: string } {
  const s = useSettings.getState();
  const code = s.home ?? s.favourites[0] ?? 'RCK';
  const st = getStation(code);
  const dirs = directionsAt(code);
  const firsts = dirs.map((d) => d.timing.first).filter(Boolean) as string[];
  const lasts = dirs.map((d) => d.timing.last).filter(Boolean) as string[];
  firsts.sort();
  lasts.sort();
  const f = firsts[0]?.slice(0, 5) ?? st.open;
  const l = lasts[lasts.length - 1]?.slice(0, 5) ?? st.close;
  return { station: st.name, text: `First ${f} · Last ${l}` };
}

export function updateStatusWidget() {
  if (Platform.OS !== 'ios') return;
  try {
    const { lines, checkedAt } = useStatus.getState();
    const bad = disruptedLines(lines);
    const home = homeTimingSummary();
    StatusWidget.updateSnapshot({
      checkedAt: checkedAt ?? 0,
      issues: bad.length,
      headline: bad.length ? `${lineLabel(bad[0])}: ${lines[bad[0].id]}` : '',
      lines: bad.map((l) => ({ n: lineLabel(l).replace(' Line', ''), c: l.color, ok: false, s: lines[l.id] })),
      first: home.text,
      station: home.station,
    });
  } catch (e) {
    console.warn('widget', e);
  }
}

let stationCountCheckedAt = 0;

/** Refresh line status (+ the daily new-stations check). Resolves true only if DMRC answered. */
export async function refreshData() {
  await whenHydrated();
  const ok = await useStatus.getState().refresh();
  updateStatusWidget();
  if (ok && Date.now() - stationCountCheckedAt > 24 * 3600e3) {
    try {
      const count = await fetchStationCount();
      useStatus.getState().set({ networkStationsLive: count });
      stationCountCheckedAt = Date.now();
    } catch {}
  }
  return ok;
}

if (!TaskManager.isTaskDefined(REFRESH_TASK)) {
  TaskManager.defineTask(REFRESH_TASK, async () => {
    try {
      const ok = await refreshData();
      return ok ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerRefreshTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    // drop the task name used by earlier builds
    if (await TaskManager.isTaskRegisteredAsync('mettro-morning-check')) await BackgroundTask.unregisterTaskAsync('mettro-morning-check').catch(() => {});
    if (!(await TaskManager.isTaskRegisteredAsync(REFRESH_TASK))) {
      await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: 60 });
    }
    return true;
  } catch (e) {
    console.warn('bg task', e);
    return false;
  }
}

export const BUNDLED_STATION_COUNT = STATIONS.length;
