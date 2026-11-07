import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Divider, Icon, LineDots, Press, T } from '@/components/ui';
import { fmtKm } from '@/lib/format';
import { getStation, nearestStations, searchStations, stationColors, type Station } from '@/lib/network';
import { locate, useNearest } from '@/lib/useLocation';
import { usePlanner } from '@/store/planner';
import { useSettings } from '@/store/settings';
import { font, radius, useTheme } from '@/theme';

export default function PickScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { field } = useLocalSearchParams<{ field: 'from' | 'to' | 'home' | 'work' }>();
  const [q, setQ] = useState('');
  const favourites = useSettings((s) => s.favourites);
  const { list: nearby } = useNearest(3, false);
  const results = useMemo(() => searchStations(q, 60), [q]);

  const choose = (code: string, viaLocation = false) => {
    if (field === 'home' || field === 'work') useSettings.getState().set({ [field]: code });
    else if (field === 'from') usePlanner.getState().set({ from: code, fromIsLocation: viaLocation });
    else usePlanner.getState().set({ to: code });
    router.back();
  };

  const label = field === 'from' ? 'Starting station' : field === 'to' ? 'Destination' : field === 'home' ? 'Home station' : 'Work station';
  const showSuggestions = !q.trim();
  const near = nearby.filter((n) => n.km < 40);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 }}>
        <T v="h2">{label}</T>
        <Press onPress={() => router.back()} hitSlop={10}>
          <T v="bodyStrong" color={c.accent}>
            Cancel
          </T>
        </Press>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: c.surface2,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            height: 44,
          }}>
          <Icon name="magnifyingglass" size={15} color={c.text3} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder="Search 250+ stations"
            placeholderTextColor={c.text3}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => results[0] && choose(results[0].code)}
            style={{ flex: 1, fontFamily: font.medium, fontSize: 16, color: c.text }}
            clearButtonMode="while-editing"
          />
        </View>
      </View>
      <FlatList
        data={results}
        keyExtractor={(s) => s.code}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          showSuggestions ? (
            <View>
              {field === 'from' ? (
                <Press
                  onPress={async () => {
                    const coords = await locate(true);
                    const n = coords ? nearestStations(coords.lat, coords.lng, 1)[0] : null;
                    if (n && n.km < 40) choose(n.station.code, true);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="location.fill" size={15} color={c.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">Nearest to me</T>
                    <T v="caption" dim>
                      {near[0] ? `${near[0].station.name} · ${fmtKm(near[0].km)}` : 'Use current location'}
                    </T>
                  </View>
                </Press>
              ) : null}
              {near.length && field !== 'from' ? <Group title="Nearby" items={near.map((n) => n.station)} onPick={choose} /> : null}
              {favourites.length ? <Group title="Saved" items={favourites.map(getStation)} onPick={choose} /> : null}
              <T v="micro" faint style={{ marginTop: 16, marginBottom: 4 }}>
                All stations
              </T>
            </View>
          ) : undefined
        }
        ItemSeparatorComponent={() => <Divider inset={0} />}
        renderItem={({ item }) => <StationItem s={item} onPress={() => choose(item.code)} />}
      />
    </View>
  );
}

function Group({ title, items, onPick }: { title: string; items: Station[]; onPick: (c: string) => void }) {
  return (
    <View style={{ marginTop: 8 }}>
      <T v="micro" faint style={{ marginTop: 8, marginBottom: 4 }}>
        {title}
      </T>
      {items.map((s, i) => (
        <View key={s.code}>
          {i > 0 ? <Divider /> : null}
          <StationItem s={s} onPress={() => onPick(s.code)} />
        </View>
      ))}
    </View>
  );
}

function StationItem({ s, onPress }: { s: Station; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
      <View style={{ width: 34, alignItems: 'center' }}>
        <LineDots colors={stationColors(s)} size={9} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {s.name}
        </T>
        <T v="caption" dim numberOfLines={1}>
          {s.interchange ? 'Interchange · ' : ''}
          {s.type}
        </T>
      </View>
    </Press>
  );
}
