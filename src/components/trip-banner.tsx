import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon, Press, T } from '@/components/ui';
import { fmtClock } from '@/lib/format';
import { getLine, getStation } from '@/lib/network';
import { computeProgress } from '@/lib/trip';
import { useTrip } from '@/store/trip';
import { radius, useTheme } from '@/theme';
import { useNow } from '@/lib/useNow';

export function TripBanner() {
  const { c } = useTheme();
  const trip = useTrip((s) => s.trip);
  const now = useNow(10000);
  if (!trip) return null;
  const p = computeProgress(trip, now);
  const leg = trip.journey.legs[Math.min(p.legIndex, trip.journey.legs.length - 1)];
  const line = getLine(leg.lineId);
  const fg = c.text;
  return (
    <Press onPress={() => router.push('/trip')} style={{ marginBottom: 12 }}>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: line.color }} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong" color={fg} numberOfLines={1}>
            {p.phase === 'arrived' ? `Arrived at ${getStation(trip.journey.to).name}` : `Next: ${p.next ? getStation(p.next.code).name : ''}`}
          </T>
          <T v="caption" color={c.text2} numberOfLines={1}>
            {p.phase === 'arrived' ? 'Tap to finish' : `Arrive ${fmtClock(p.eta)} · ${p.action}`}
          </T>
        </View>
        <Icon name="chevron.right" size={14} color={fg} />
      </View>
    </Press>
  );
}
