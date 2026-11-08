import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openTrip, renameTrip, SavedTripRow } from '@/components/saved-trips';
import { Button, Card, Divider, Press, T } from '@/components/ui';
import { rankTrips } from '@/lib/savedTrips';
import { useNearest } from '@/lib/useLocation';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

export default function TripsScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const trips = useSettings((s) => s.trips);
  const { coords } = useNearest(1, false);
  const ranked = useMemo(() => rankTrips(trips, coords), [trips, coords]);
  // null = browsing; a set = select mode (for deleting)
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selecting = picked !== null;

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const remove = () => {
    if (!picked?.size) return;
    const n = picked.size;
    Alert.alert(n === 1 ? 'Delete this trip?' : `Delete ${n} trips?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          picked.forEach((id) => useSettings.getState().deleteTrip(id));
          setPicked(null);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: 'Trips',
          headerRight: () =>
            trips.length ? (
              <Press
                onPress={() => setPicked(selecting ? null : new Set())}
                hitSlop={8}
                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
                <T v="bodyStrong" color={c.accent}>
                  {selecting ? 'Done' : 'Select'}
                </T>
              </Press>
            ) : null,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 110 }}>
        {ranked.length ? (
          <>
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {ranked.map((r, i) => (
                <View key={r.trip.id}>
                  {i > 0 ? <Divider /> : null}
                  <SavedTripRow
                    trip={r.trip}
                    from={r.from}
                    near={r.near}
                    selected={selecting ? picked.has(r.trip.id) : undefined}
                    onPress={() => (selecting ? toggle(r.trip.id) : openTrip(r.trip, coords))}
                    onLongPress={selecting ? undefined : () => renameTrip(r.trip, r.from)}
                    longPressLabel="Rename"
                  />
                </View>
              ))}
            </Card>
            {!selecting ? (
              <T v="caption" faint style={{ textAlign: 'center', marginTop: 12 }}>
                Long-press a trip to rename it.
              </T>
            ) : null}
          </>
        ) : (
          <T v="body" dim style={{ textAlign: 'center', marginTop: 40 }}>
            No saved trips yet. Plan a route and tap the bookmark to save it.
          </T>
        )}
      </ScrollView>
      {selecting ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 10, backgroundColor: c.bg }}>
          <Button
            title={picked.size > 1 ? `Delete ${picked.size} trips` : 'Delete'}
            kind="danger"
            icon="trash"
            disabled={!picked.size}
            onPress={remove}
          />
        </View>
      ) : null}
    </View>
  );
}
