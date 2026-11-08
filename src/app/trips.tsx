import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openTrip, SavedTripRow } from '@/components/saved-trips';
import { Card, Divider, IconButton, Press, T } from '@/components/ui';
import { getStation } from '@/lib/network';
import { rankTrips, tripTitle, type SavedTrip } from '@/lib/savedTrips';
import { useNearest } from '@/lib/useLocation';
import { useSettings } from '@/store/settings';
import { font, useTheme } from '@/theme';

export default function TripsScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const trips = useSettings((s) => s.trips);
  const { coords } = useNearest(1, false);
  const [editing, setEditing] = useState(false);
  const ranked = useMemo(() => rankTrips(trips, coords), [trips, coords]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: 'Trips',
          headerRight: () =>
            trips.length ? (
              <Press onPress={() => setEditing((v) => !v)} hitSlop={8} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
                <T v="bodyStrong" color={c.accent}>
                  {editing ? 'Done' : 'Edit'}
                </T>
              </Press>
            ) : null,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {ranked.length ? (
          <Card pad={0} style={{ paddingHorizontal: 14 }}>
            {ranked.map((r, i) => (
              <View key={r.trip.id}>
                {i > 0 ? <Divider /> : null}
                {editing ? (
                  <EditRow trip={r.trip} from={r.from} />
                ) : (
                  <SavedTripRow trip={r.trip} from={r.from} near={r.near} onPress={() => openTrip(r.trip, coords)} />
                )}
              </View>
            ))}
          </Card>
        ) : (
          <T v="body" dim style={{ textAlign: 'center', marginTop: 40 }}>
            No saved trips yet. Plan a route and tap the bookmark to save it.
          </T>
        )}
      </ScrollView>
    </View>
  );
}

function EditRow({ trip, from }: { trip: SavedTrip; from: string }) {
  const { c } = useTheme();
  const [title, setTitle] = useState(trip.title ?? '');
  const to = from === trip.a ? trip.b : trip.a;
  const remove = () =>
    Alert.alert('Delete trip?', tripTitle(trip, from), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => useSettings.getState().deleteTrip(trip.id) },
    ]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <TextInput
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            useSettings.getState().renameTrip(trip.id, v);
          }}
          placeholder={tripTitle({ ...trip, title: null }, from)}
          placeholderTextColor={c.text3}
          returnKeyType="done"
          accessibilityLabel="Trip name"
          style={{ fontFamily: font.semibold, fontSize: 15, color: c.text, paddingVertical: 4 }}
        />
        <T v="caption" dim numberOfLines={1}>
          {getStation(from).name} ↔ {getStation(to).name}
        </T>
      </View>
      <IconButton onPress={remove} accessibilityLabel="Delete trip" icon="trash" size={18} color={c.danger} />
    </View>
  );
}
