import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Empty, Icon, LineChip, Press, SectionHeader, T } from '@/components/ui';
import { fmtClock } from '@/lib/format';
import { getLine, getStation, lineLabel } from '@/lib/network';
import { computeProgress, setPosition, stopTrip, tick } from '@/lib/trip';
import { useTrip } from '@/store/trip';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme';

export default function TripScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const trip = useTrip((s) => s.trip);
  const now = useNow(5000);
  const [showAll, setShowAll] = useState(false);

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
  const hasHidden = p.idx > 0 || p.pts.length > p.idx + 4;
  const j = trip.journey;
  const leg = j.legs[Math.min(p.legIndex, j.legs.length - 1)];
  const line = getLine(leg.lineId);
  const minsToNext = Math.max(0, Math.round((p.nextAt - now) / 60000));
  const minsLeft = Math.max(0, Math.round((p.eta - now) / 60000));
  const waiting = p.phase === 'waiting';
  const minsToDepart = Math.max(0, Math.round((p.departAt - now) / 60000));

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
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 110 }}>
        <Card pad={24}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: line.color }} />
            <T v="label" dim style={{ flex: 1 }}>
              {lineLabel(line)} · {leg.towards}
            </T>
          </View>
          <T v="label" dim>
            {p.phase === 'arrived' ? 'You’ve arrived' : waiting ? 'Your train' : 'Next stop'}
          </T>
          <T v="display" style={{ marginTop: 6 }}>
            {waiting ? fmtClock(p.departAt) : getStation(p.phase === 'arrived' ? j.to : (p.next?.code ?? j.to)).name}
          </T>
          {p.phase !== 'arrived' ? (
            <T v="body" dim style={{ marginTop: 8 }}>
              {waiting ? `Leaves ${getStation(p.current.code).name} in ${minsToDepart} min` : minsToNext <= 0 ? 'Arriving now' : `In about ${minsToNext} min`}
            </T>
          ) : null}
          <View style={{ height: 3, borderRadius: 2, marginTop: 24, marginBottom: 20, backgroundColor: c.surface2, overflow: 'hidden' }}>
            <View style={{ height: 3, width: `${Math.round(p.progress * 100)}%`, backgroundColor: line.color }} />
          </View>
          {p.phase !== 'arrived' ? (
            // One line: what to do, and when it's over. No GPS/timetable status — that's the engine's business.
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
                {p.action}
              </T>
              <T v="label" dim style={{ fontVariant: ['tabular-nums'] }}>
                {minsLeft} min · {fmtClock(p.eta)}
              </T>
            </View>
          ) : null}
        </Card>

        <SectionHeader title={showAll ? 'Your route' : 'Coming up'} />
        <Card pad={16}>
          {p.pts.map((pt, i) => {
            if (!showAll && (i < p.idx || i > p.idx + 3)) return null;
            const passed = i < p.idx;
            const here = i === p.idx;
            const ln = getLine(j.legs[pt.legIndex].lineId);
            const nextPt = !showAll && i === p.idx + 3 ? undefined : p.pts[i + 1];
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
                style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: pt.transfer ? 72 : 48 }}>
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
                    <View style={{ position: 'absolute', top: 10, bottom: -4, width: 3, borderRadius: 2, backgroundColor: i < p.idx ? c.border : segColor }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingLeft: 10, paddingBottom: 10 }}>
                  <T v={here || pt.transfer ? 'bodyStrong' : 'body'} faint={passed} numberOfLines={2}>
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
          {hasHidden || showAll ? (
            <Press
              onPress={() => setShowAll((v) => !v)}
              hitSlop={6}
              accessibilityLabel={showAll ? 'Show fewer stops' : 'Show all stops'}
              accessibilityState={{ expanded: showAll }}
              style={{ alignItems: 'center', justifyContent: 'center', height: 28, marginTop: -8 }}>
              <Icon name={showAll ? 'chevron.up' : 'chevron.down'} size={14} color={c.text3} />
            </Press>
          ) : null}
        </Card>
        {showAll && p.phase !== 'arrived' ? (
          <T v="caption" faint style={{ marginTop: 8, paddingHorizontal: 4 }}>
            Tap a stop to correct your position.
          </T>
        ) : null}
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: insets.bottom + 10,
          backgroundColor: c.bg,
        }}>
        {p.phase === 'arrived' ? (
          <Button
            title="Done"
            onPress={async () => {
              await stopTrip();
              router.back();
            }}
          />
        ) : (
          <Button title="End trip" kind="secondary" onPress={end} />
        )}
      </View>
    </View>
  );
}
