import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Divider, Press, Row, SectionHeader, T } from '@/components/ui';
import { ago } from '@/lib/format';
import { TOPICS } from '@/lib/info';
import { BUNDLED_STATION_COUNT, refreshData, updateStatusWidget } from '@/lib/refresh';
import { DATA_GENERATED, getStation } from '@/lib/network';
import { useSettings, type Appearance } from '@/store/settings';
import { useStatus } from '@/store/status';
import { radius, useTheme } from '@/theme';

export default function MoreScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const status = useStatus();
  const [checking, setChecking] = useState(false);

  const liveCount = status.networkStationsLive;
  const newStations = liveCount != null && liveCount > BUNDLED_STATION_COUNT; // depots are filtered in fetchStationCount

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 120 }}>
        <T v="caption" dim>
          Settings & information
        </T>
        <T v="display">More</T>

        <SectionHeader title="Live data" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          <Row
            icon="antenna.radiowaves.left.and.right"
            iconColor={c.success}
            title="Routes, timings & fares are live"
            subtitle="Fetched from the DMRC journey planner every time you search. Line status refreshes quietly in the background — no notifications."
            subtitleLines={0}
          />
          <Divider inset={44} />
          <Row
            icon="arrow.clockwise"
            title="Refresh line status"
            subtitle={status.checkedAt ? `Last checked ${ago(status.checkedAt)}` : (status.error ?? 'Not checked yet')}
            right={
              checking ? (
                <T v="caption" dim>
                  Checking…
                </T>
              ) : undefined
            }
            onPress={async () => {
              setChecking(true);
              const ok = await refreshData();
              setChecking(false);
              if (!ok) Alert.alert('Couldn’t reach DMRC', useStatus.getState().error ?? 'Try again later.');
            }}
          />
        </Card>

        <SectionHeader title="Your stations" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          <Row
            icon="house.fill"
            title="Home"
            subtitle={s.home ? getStation(s.home).name : 'Not set'}
            chevron
            onPress={() => router.push({ pathname: '/pick', params: { field: 'home' } })}
          />
          <Divider inset={44} />
          <Row
            icon="briefcase.fill"
            title="Work"
            subtitle={s.work ? getStation(s.work).name : 'Not set'}
            chevron
            onPress={() => router.push({ pathname: '/pick', params: { field: 'work' } })}
          />
        </Card>

        <SectionHeader title="Trips" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          <Row
            icon="platter.filled.bottom.iphone"
            iconColor="#7C3AED"
            title="Live Activities"
            subtitle="Lock Screen & Dynamic Island while riding"
            right={<Switch value={s.liveActivities} onValueChange={(v) => s.set({ liveActivities: v })} />}
          />
        </Card>

        <SectionHeader title="Appearance" />
        <Card pad={6} style={{ flexDirection: 'row', gap: 6 }}>
          {(['system', 'light', 'dark'] as Appearance[]).map((a) => (
            <Press
              key={a}
              onPress={() => s.set({ appearance: a })}
              style={{
                flex: 1,
                height: 36,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: s.appearance === a ? c.ink : 'transparent',
              }}>
              <T v="label" color={s.appearance === a ? c.onInk : c.text}>
                {a[0].toUpperCase() + a.slice(1)}
              </T>
            </Press>
          ))}
        </Card>

        <SectionHeader title="Travel info" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          {TOPICS.map((t, i) => (
            <View key={t.id}>
              {i > 0 ? <Divider inset={44} /> : null}
              <Row
                icon={t.icon as any}
                title={t.title}
                subtitle={t.subtitle}
                chevron
                onPress={() => router.push({ pathname: '/info/[topic]', params: { topic: t.id } })}
              />
            </View>
          ))}
        </Card>

        <SectionHeader title="Cities" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          <Row icon="checkmark.circle.fill" iconColor={c.success} title="Delhi Metro" subtitle="DMRC · Rapid Metro Gurugram · Airport Express" />
          <Divider inset={44} />
          <Row icon="clock.fill" iconColor={c.text3} title="More metros coming" subtitle="Mumbai, Bengaluru, Hyderabad, Chennai…" />
        </Card>

        <SectionHeader title="Data" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          <Row
            icon="externaldrive.fill.badge.checkmark"
            title={`${BUNDLED_STATION_COUNT} stations on device`}
            subtitle={`Timetable snapshot ${DATA_GENERATED ? new Date(DATA_GENERATED).toDateString() : ''} · Source: DMRC`}
          />
          {newStations ? (
            <>
              <Divider inset={44} />
              <Row
                icon="sparkles"
                iconColor={c.warn}
                title="New stations available"
                subtitle={`DMRC now lists ${liveCount} stations. Update Mettro to get them.`}
              />
            </>
          ) : null}
          <Divider inset={44} />
          <Row
            icon="square.and.arrow.up.on.square"
            title="Refresh home-screen widget"
            onPress={() => {
              updateStatusWidget();
              Alert.alert('Widget updated');
            }}
          />
        </Card>

        <T v="caption" faint style={{ textAlign: 'center', marginTop: 24 }}>
          Mettro {Constants.expoConfig?.version} · Not affiliated with DMRC.{'\n'}Live data from the public DMRC journey planner.
        </T>
      </ScrollView>
    </View>
  );
}
