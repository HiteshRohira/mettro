import * as BackgroundTask from 'expo-background-task';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { fetchStationCount } from '@/lib/api';
import { whenHydrated } from '@/lib/hydration';
import { getStation, lineLabel, STATIONS } from '@/lib/network';
import { rankTrips, tripTitle, type Coords } from '@/lib/savedTrips';
import { useLoc } from '@/lib/useLocation';
import { useSettings } from '@/store/settings';
import { disruptedLines, useStatus } from '@/store/status';
import StatusWidget from '@/widgets/StatusWidget';

/**
 * Silent background refresh — no notifications.
 * Routes, timings and fares are always fetched live from DMRC when you plan a trip;
 * this keeps the line status, the home-screen widget and the "new stations" check fresh.
 */
export const REFRESH_TASK = 'mettro-data-refresh';

/** Where you are for ranking trips: the app's last fix, else the OS's (never prompts). */
async function lastCoords(): Promise<Coords | null> {
  const mem = useLoc.getState().coords;
  if (mem) return mem;
  try {
    if (!(await Location.getForegroundPermissionsAsync()).granted) return null;
    const p = await Location.getLastKnownPositionAsync({ maxAge: 3 * 3600e3 });
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** The trip you're most likely to take next: the top of the Trips list. */
export async function likelyTrip() {
  const top = rankTrips(useSettings.getState().trips, await lastCoords())[0];
  if (!top) return null;
  return { title: tripTitle(top.trip, top.from), route: `${getStation(top.from).name} → ${getStation(top.to).name}`, id: top.trip.id };
}

export async function updateStatusWidget() {
  if (Platform.OS !== 'ios') return;
  try {
    const { lines, checkedAt } = useStatus.getState();
    const bad = disruptedLines(lines);
    const trip = await likelyTrip();
    StatusWidget.updateSnapshot({
      checkedAt: checkedAt ?? 0,
      issues: bad.length,
      headline: bad.length ? `${lineLabel(bad[0])}: ${lines[bad[0].id]}` : '',
      lines: bad.map((l) => ({ n: lineLabel(l).replace(' Line', ''), c: l.color, ok: false, s: lines[l.id] })),
      trip: trip?.title ?? '',
      route: trip?.route ?? '',
      url: trip ? `mettro://go/${encodeURIComponent(trip.id)}` : 'mettro://',
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
  await updateStatusWidget();
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
