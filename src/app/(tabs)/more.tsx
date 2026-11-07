import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Divider, Press, Row, SectionHeader, T } from '@/components/ui';
import { TOPICS } from '@/lib/info';
import { getStation } from '@/lib/network';
import { BUNDLED_STATION_COUNT } from '@/lib/refresh';
import { useSettings, type Appearance } from '@/store/settings';
import { useStatus } from '@/store/status';
import { radius, useTheme } from '@/theme';

export default function MoreScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const liveCount = useStatus((st) => st.networkStationsLive);
  const newStations = liveCount != null && liveCount - 1 > BUNDLED_STATION_COUNT; // station_list has 1 depot entry

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 120 }}>
        <T v="display">More</T>

        {newStations ? (
          <Card style={{ marginTop: 16, backgroundColor: c.accentSoft, borderColor: 'transparent' }}>
            <T v="label" color={c.accent}>
              DMRC lists new stations. Update Mettro to get them.
            </T>
          </Card>
        ) : null}

        <SectionHeader title="Your stations" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          <SettingRow
            title="Home"
            value={s.home ? getStation(s.home).name : 'Set'}
            onPress={() => router.push({ pathname: '/pick', params: { field: 'home' } })}
          />
          <Divider />
          <SettingRow
            title="Work"
            value={s.work ? getStation(s.work).name : 'Set'}
            onPress={() => router.push({ pathname: '/pick', params: { field: 'work' } })}
          />
        </Card>

        <SectionHeader title="Preferences" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 50 }}>
            <T v="body" style={{ flex: 1 }}>
              Live Activity during trips
            </T>
            <Switch value={s.liveActivities} onValueChange={(v) => s.set({ liveActivities: v })} />
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 50, gap: 12 }}>
            <T v="body" style={{ flex: 1 }}>
              Appearance
            </T>
            <View style={{ flexDirection: 'row', backgroundColor: c.surface2, borderRadius: radius.sm, padding: 2 }}>
              {(['system', 'light', 'dark'] as Appearance[]).map((a) => (
                <Press
                  key={a}
                  onPress={() => s.set({ appearance: a })}
                  accessibilityLabel={`Appearance ${a}`}
                  style={{
                    paddingHorizontal: 10,
                    height: 28,
                    borderRadius: 6,
                    justifyContent: 'center',
                    backgroundColor: s.appearance === a ? c.surface : 'transparent',
                  }}>
                  <T v="label" color={s.appearance === a ? c.text : c.text2}>
                    {a === 'system' ? 'Auto' : a[0].toUpperCase() + a.slice(1)}
                  </T>
                </Press>
              ))}
            </View>
          </View>
        </Card>

        <SectionHeader title="Travel info" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          {TOPICS.map((t, i) => (
            <View key={t.id}>
              {i > 0 ? <Divider /> : null}
              <Row title={t.title} chevron onPress={() => router.push({ pathname: '/info/[topic]', params: { topic: t.id } })} />
            </View>
          ))}
        </Card>

        <T v="caption" faint style={{ textAlign: 'center', marginTop: 28 }}>
          Mettro {Constants.expoConfig?.version} · Not affiliated with DMRC
        </T>
      </ScrollView>
    </View>
  );
}

function SettingRow({ title, value, onPress }: { title: string; value: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Row
      title={title}
      onPress={onPress}
      chevron
      right={
        <T v="body" color={c.text3} numberOfLines={1} style={{ maxWidth: '60%' }}>
          {value}
        </T>
      }
    />
  );
}
