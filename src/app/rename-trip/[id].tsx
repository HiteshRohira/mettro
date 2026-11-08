import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { saveName } from '@/components/saved-trips';
import { Button, T } from '@/components/ui';
import { tripTitle } from '@/lib/savedTrips';
import { useSettings } from '@/store/settings';
import { font, radius, useTheme } from '@/theme';

/** Android rename sheet (iOS uses the system text prompt). */
export default function RenameTripScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useSettings((s) => s.trips.find((t) => t.id === id));
  const [name, setName] = useState(trip ? (trip.title ?? tripTitle(trip)) : '');
  if (!trip) return null;
  const save = () => {
    saveName(trip, name);
    router.back();
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, gap: 12 }}>
      <Stack.Screen options={{ title: 'Rename trip' }} />
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={save}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        placeholder={tripTitle({ ...trip, title: null })}
        placeholderTextColor={c.text3}
        accessibilityLabel="Trip name"
        style={{ fontFamily: font.semibold, fontSize: 17, color: c.text, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 }}
      />
      <T v="caption" dim>
        Leave it empty to use the station names.
      </T>
      <Button title="Save" onPress={save} />
    </View>
  );
}
