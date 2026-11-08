import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Icon, Press, T } from '@/components/ui';
import { fmtDuration } from '@/lib/format';
import { getStation } from '@/lib/network';
import { planOffline } from '@/lib/router';
import { orient, tripTitle, type Coords, type SavedTrip } from '@/lib/savedTrips';
import { usePlanner } from '@/store/planner';
import { useTheme } from '@/theme';

/** Opens the route for a saved trip, starting from the end you're near (else the way you last took it). */
export function openTrip(t: SavedTrip, at: Coords | null) {
  const { from, to } = orient(t, at);
  const when = usePlanner.getState().when;
  router.push({ pathname: '/journey', params: { from, to, at: when ? String(when) : '' } });
}

export function SavedTripRow({ trip, from, near, onPress, right }: { trip: SavedTrip; from: string; near: boolean; onPress?: () => void; right?: React.ReactNode }) {
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
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tripTitle(trip, from)}, ${sub}`}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, minHeight: 56 }}>
      <Icon name={near ? 'location.fill' : 'arrow.up.right'} size={16} color={near ? c.accent : c.text3} />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="bodyStrong" numberOfLines={2}>
          {tripTitle(trip, from)}
        </T>
        <T v="caption" dim numberOfLines={1}>
          {sub}
        </T>
      </View>
      {right ?? <Icon name="chevron.right" size={12} color={c.text3} />}
    </Press>
  );
}
