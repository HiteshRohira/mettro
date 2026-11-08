import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActionSheetIOS, Alert, Platform, View } from 'react-native';

import { Icon, Press, T } from '@/components/ui';
import { fmtDuration } from '@/lib/format';
import { getStation } from '@/lib/network';
import { planOffline } from '@/lib/router';
import { orient, tripTitle, type Coords, type SavedTrip } from '@/lib/savedTrips';
import { usePlanner } from '@/store/planner';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

/** Opens the route for a saved trip, starting from the end you're near (else the way you last took it). */
export function openTrip(t: SavedTrip, at: Coords | null) {
  const { from, to } = orient(t, at);
  const when = usePlanner.getState().when;
  router.push({ pathname: '/journey', params: { from, to, at: when ? String(when) : '' } });
}

/** Rename: the system text prompt on iOS, a small sheet on Android (which has no prompt). */
export function renameTrip(t: SavedTrip, from = t.a) {
  if (Platform.OS !== 'ios') {
    router.push({ pathname: '/rename-trip/[id]', params: { id: t.id } });
    return;
  }
  Alert.prompt(
    'Rename trip',
    'Leave it empty to use the station names.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: (name?: string) => saveName(t, name ?? '') },
    ],
    'plain-text',
    t.title ?? tripTitle(t, from),
  );
}

/** Stores a name; the default "A – B" (either way round) stays unnamed so it keeps following the direction. */
export function saveName(t: SavedTrip, name: string) {
  const n = name.trim();
  const isDefault = n === tripTitle({ ...t, title: null }, t.a) || n === tripTitle({ ...t, title: null }, t.b);
  useSettings.getState().renameTrip(t.id, isDefault ? '' : n);
}

/** Long-press menu on Home: rename or delete. */
export function tripMenu(t: SavedTrip, from = t.a) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const title = tripTitle(t, from);
  const del = () => useSettings.getState().deleteTrip(t.id);
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: ['Rename', 'Delete', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (i) => (i === 0 ? renameTrip(t, from) : i === 1 ? del() : undefined),
    );
  } else {
    Alert.alert(title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: del },
      { text: 'Rename', onPress: () => renameTrip(t, from) },
    ]);
  }
}

export function SavedTripRow({
  trip,
  from,
  near,
  onPress,
  onLongPress,
  longPressLabel,
  selected,
}: {
  trip: SavedTrip;
  from: string;
  near: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** VoiceOver name for the long-press action, e.g. "Rename". */
  longPressLabel?: string;
  /** Defined only in select mode. */
  selected?: boolean;
}) {
  const { c } = useTheme();
  const to = from === trip.a ? trip.b : trip.a;
  // Offline estimate: instant, and good enough to say how long the ride is.
  const mins = useMemo(() => {
    const j = planOffline(from, to);
    return j ? fmtDuration(j.totalS) : '';
  }, [from, to]);
  // Near one end you already know where you are: just say how long, and where it goes.
  const sub = near ? [mins, `to ${getStation(to).name}`].filter(Boolean).join(' ') : [`From ${getStation(from).name}`, mins].filter(Boolean).join(' · ');
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tripTitle(trip, from)}, ${sub}`}
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: longPressLabel ?? 'More' }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onLongPress?.()}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, minHeight: 56 }}>
      {selected === undefined ? (
        <Icon name={near ? 'location.fill' : 'arrow.up.right'} size={16} color={near ? c.accent : c.text3} />
      ) : (
        <Icon name={selected ? 'checkmark.circle.fill' : 'circle'} size={20} color={selected ? c.accent : c.text3} />
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <T v="bodyStrong" numberOfLines={2}>
          {tripTitle(trip, from)}
        </T>
        <T v="caption" dim numberOfLines={1}>
          {sub}
        </T>
      </View>
      {selected === undefined ? <Icon name="chevron.right" size={12} color={c.text3} /> : null}
    </Press>
  );
}
