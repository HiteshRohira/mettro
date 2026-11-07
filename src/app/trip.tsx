import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Empty, LineChip, Press, T } from '@/components/ui';
import { fmtClock } from '@/lib/format';
import { getLine, getStation, lineLabel, onLineColor } from '@/lib/network';
import { computeProgress, setPosition, stopTrip, tick } from '@/lib/trip';
import { useTrip } from '@/store/trip';
import { useNow } from '@/lib/useNow';
import { radius, useTheme } from '@/theme';

export default function TripScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const trip = useTrip((s) => s.trip);
  const now = useNow(5000);

  useEffect(() => {
    tick();
  }, [now]);

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 16 }}>
        <Empty icon="tram" title="No active trip" text="Start a trip from any route." />
        <Button title="Plan a trip" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const p = computeProgress(trip, now);
  const j = trip.journey;
  const leg = j.legs[Math.min(p.legIndex, j.legs.length - 1)];
  const line = getLine(leg.lineId);
  const fg = onLineColor(line.color);
  const minsToNext = Math.max(0, Math.round((p.nextAt - now) / 60000));
  const gpsFresh = trip.gpsIdxAt && now - trip.gpsIdxAt < 5 * 60e3;
  const delayMin = Math.round(trip.delayMs / 60000);

  const end = () =>
    Alert.alert('End trip?', 'This stops tracking and removes the Live Activity.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'End trip',
        style: 'destructive',
        onPress: async () => {
          await stopTrip();
          router.back();
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={{ backgroundColor: line.color, borderRadius: radius.xl, padding: 18, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <T v="label" color={fg} style={{ opacity: 0.8, flex: 1 }} numberOfLines={2}>
              {lineLabel(line)} · towards {leg.towards}
            </T>
            <T v="label" color={fg}>
              {p.phase === 'arrived' ? 'Done' : `Arrive ${fmtClock(p.eta)}`}
            </T>
          </View>
          <T v="title" color={fg}>
            {p.phase === 'arrived' ? `You’ve arrived at ${getStation(j.to).name}` : `Next: ${p.next ? getStation(p.next.code).name : ''}`}
          </T>
          {p.phase !== 'arrived' ? (
            <T v="body" color={fg} style={{ opacity: 0.9 }}>
              {minsToNext <= 0 ? 'Arriving now' : `in about ${minsToNext} min`} · {p.stopsLeft} stop{p.stopsLeft === 1 ? '' : 's'} to go
            </T>
          ) : null}
          <View style={{ height: 4, borderRadius: 2, marginVertical: 6, backgroundColor: fg + '33', overflow: 'hidden' }}>
            <View style={{ height: 4, width: `${Math.round(p.progress * 100)}%`, backgroundColor: fg }} />
          </View>
          <T v="label" color={fg} style={{ opacity: 0.9 }}>
            {p.action}
          </T>
        </View>

        <T v="caption" faint style={{ marginTop: 10, paddingHorizontal: 4 }}>
          {[
            gpsFresh ? 'Tracking by GPS' : 'Following the timetable',
            Math.abs(delayMin) >= 2 && p.phase !== 'arrived' ? (delayMin > 0 ? `${delayMin} min behind` : `${-delayMin} min ahead`) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </T>

        <Card style={{ marginTop: 12 }} pad={12}>
          {p.pts.map((pt, i) => {
            const passed = i < p.idx;
            const here = i === p.idx;
            const ln = getLine(j.legs[pt.legIndex].lineId);
            const nextPt = p.pts[i + 1];
            const segColor = nextPt ? getLine(j.legs[nextPt.legIndex].lineId).color : ln.color;
            const at = pt.at + trip.delayMs;
            return (
              <Press
                key={pt.code + i}
                haptic
                onPress={() =>
                  Alert.alert(`At ${getStation(pt.code).name}?`, 'Update your position to this station.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'I’m here', onPress: () => setPosition(i) },
                  ])
                }
                style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: pt.transfer ? 58 : 40 }}>
                <View style={{ width: 48, paddingTop: 2 }}>
                  <T v="caption" faint={passed} style={{ fontVariant: ['tabular-nums'] }}>
                    {fmtClock(at)}
                  </T>
                </View>
                <View style={{ width: 22, alignItems: 'center' }}>
                  <View
                    style={{
                      width: here ? 16 : pt.transfer || i === p.pts.length - 1 || i === 0 ? 12 : 8,
                      height: here ? 16 : pt.transfer || i === p.pts.length - 1 || i === 0 ? 12 : 8,
                      borderRadius: 8,
                      marginTop: here ? 0 : 3,
                      backgroundColor: here ? c.surface : passed ? c.text3 : ln.color,
                      borderWidth: here ? 4 : 0,
                      borderColor: ln.color,
                      zIndex: 2,
                    }}
                  />
                  {nextPt ? (
                    <View style={{ position: 'absolute', top: 10, bottom: -4, width: 4, borderRadius: 2, backgroundColor: i < p.idx ? c.border : segColor }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingLeft: 10, paddingBottom: 10 }}>
                  <T v={here || pt.transfer ? 'bodyStrong' : 'body'} faint={passed} numberOfLines={1}>
                    {getStation(pt.code).name}
                  </T>
                  {pt.transfer ? (
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
                      <T v="caption" dim>
                        Change to
                      </T>
                      <LineChip line={j.legs[pt.legIndex + 1].lineId} small />
                      <T v="caption" dim numberOfLines={1} style={{ flex: 1 }}>
                        → {j.legs[pt.legIndex + 1].towards}
                      </T>
                    </View>
                  ) : null}
                </View>
              </Press>
            );
          })}
        </Card>
        {p.phase !== 'arrived' ? (
          <T v="caption" faint style={{ marginTop: 8, paddingHorizontal: 4 }}>
            Tap a stop to correct your position.
          </T>
        ) : null}

        {p.phase === 'arrived' ? (
          <Button
            title="Done"
            onPress={async () => {
              await stopTrip();
              router.back();
            }}
            style={{ marginTop: 16 }}
          />
        ) : (
          <Button title="End trip" kind="secondary" onPress={end} style={{ marginTop: 20 }} />
        )}
      </ScrollView>
    </View>
  );
}
