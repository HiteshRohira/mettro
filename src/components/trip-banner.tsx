import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon, Press, T } from '@/components/ui';
import { fmtClock } from '@/lib/format';
import { getLine, getStation, onLineColor } from '@/lib/network';
import { computeProgress } from '@/lib/trip';
import { useTrip } from '@/store/trip';
import { radius } from '@/theme';
import { useNow } from '@/lib/useNow';

export function TripBanner() {
  const trip = useTrip((s) => s.trip);
  const now = useNow(10000);
  if (!trip) return null;
  const p = computeProgress(trip, now);
  const leg = trip.journey.legs[Math.min(p.legIndex, trip.journey.legs.length - 1)];
  const line = getLine(leg.lineId);
  const fg = onLineColor(line.color);
  return (
    <Press onPress={() => router.push('/trip')} style={{ marginBottom: 12 }}>
      <View style={{ backgroundColor: line.color, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="tram.fill" size={18} color={fg} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong" color={fg} numberOfLines={1}>
            {p.phase === 'arrived' ? `Arrived at ${getStation(trip.journey.to).name}` : `Next: ${p.next ? getStation(p.next.code).name : ''}`}
          </T>
          <T v="caption" color={fg} numberOfLines={1} style={{ opacity: 0.85 }}>
            {p.phase === 'arrived' ? 'Tap to finish' : `Arrive ${fmtClock(p.eta)} · ${p.action}`}
          </T>
        </View>
        <Icon name="chevron.right" size={14} color={fg} />
      </View>
    </Press>
  );
}
