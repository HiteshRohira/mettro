import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Toggle } from '@/components/platform/toggle';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Disclosure, Divider, Press, Row, SectionHeader, T } from '@/components/ui';
import { TOPICS } from '@/lib/info';
import { BUNDLED_STATION_COUNT } from '@/lib/refresh';
import { useSettings, type Appearance } from '@/store/settings';
import { useStatus } from '@/store/status';
import { radius, useTheme } from '@/theme';

// Android's ongoing trip notification plays the Live Activity's role.
const LIVE_LABEL = Platform.OS === 'android' ? 'Live trip notification' : 'Live Activity during trips';

export default function MoreScreen() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const liveCount = useStatus((st) => st.networkStationsLive);
  const newStations = liveCount != null && liveCount > BUNDLED_STATION_COUNT; // depots are filtered in fetchStationCount

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 120 }}>
        <T v="display">More</T>

        {newStations ? (
          <Card style={{ marginTop: 16, backgroundColor: c.accentSoft, borderColor: 'transparent' }}>
            <T v="label" color={c.accent}>
              DMRC lists new stations. Update Mettro to get them.
            </T>
          </Card>
        ) : null}

        <SectionHeader title="Preferences" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
            <T v="body" style={{ flex: 1 }}>{LIVE_LABEL}</T>
            <Toggle value={s.liveActivities} onChange={(v) => s.set({ liveActivities: v })} label={LIVE_LABEL} scheme={scheme} />
          </View>
          <Disclosure title="Appearance" detail={s.appearance === 'system' ? 'Automatic' : s.appearance === 'light' ? 'Light' : 'Dark'}>
            <View style={{ flexDirection: 'row', gap: 4, backgroundColor: c.surface2, padding: 4, borderRadius: radius.pill }}>
              {(['system', 'light', 'dark'] as Appearance[]).map((a) => (
                <Press
                  key={a}
                  onPress={() => s.set({ appearance: a })}
                  accessibilityLabel={`Appearance ${a}`}
                  accessibilityState={{ selected: s.appearance === a }}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 44,
                    borderRadius: radius.pill,
                    backgroundColor: s.appearance === a ? c.raised : 'transparent',
                  }}>
                  <T v="label" color={s.appearance === a ? c.text : c.text2}>
                    {a === 'system' ? 'Auto' : a === 'light' ? 'Light' : 'Dark'}
                  </T>
                </Press>
              ))}
            </View>
          </Disclosure>
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

