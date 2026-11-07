import { requireOptionalNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';

import type { TripActivityProps } from '@/widgets/TripActivity';

/**
 * Android's counterpart of the trip Live Activity: the ongoing (silent) notification Android requires
 * while the trip's location service runs. Content updates go through a small expo-location patch
 * (patches/expo-location+*.patch) that re-posts the service notification.
 */
type Native = { updateForegroundNotificationAsync?: (o: Record<string, string | number>) => Promise<boolean> };
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('ExpoLocation') : null;

/** Android 13+ hides a foreground service's notification unless this is granted. */
export async function ensureNotificationPermission(ask: boolean) {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(perm)) return true;
  if (!ask) return false;
  return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
}

export function tripNotificationContent(p: TripActivityProps) {
  const done = p.phase === 'arrived';
  const subtitle = done ? p.action : `${p.lineName} · towards ${p.towards}`;
  const body = done ? `Arrived · ${p.etaText}` : `${p.action ? p.action + ' · ' : ''}Arrive ${p.etaText}`;
  const content: Record<string, string | number> = {
    notificationTitle: p.title,
    notificationBody: body,
    notificationBigText: done ? body : `${body}\nNow: ${p.current}${p.stopsLeft > 0 ? ` · ${p.stopsLeft} stop${p.stopsLeft === 1 ? '' : 's'} to ${p.dest}` : ''}`,
    notificationSubText: subtitle,
    notificationColor: p.lineColor,
    notificationProgress: done ? 1 : Math.max(0, Math.min(1, p.progress)),
  };
  if (!done) content.notificationCountdownTo = p.nextAt;
  return content;
}

export async function updateTripNotification(p: TripActivityProps) {
  if (!native?.updateForegroundNotificationAsync) return false;
  try {
    return await native.updateForegroundNotificationAsync(tripNotificationContent(p));
  } catch {
    return false;
  }
}
