import { DatePicker, Host } from '@expo/ui/swift-ui';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusSummary } from '@/components/status';
import { TripBanner } from '@/components/trip-banner';
import { Button, Card, Divider, Icon, LineDots, Pill, Press, SectionHeader, T } from '@/components/ui';
import { fmtClock, fmtKm, hm, walkMin } from '@/lib/format';
import { directionsAt, getStation, stationColors, titleTowards } from '@/lib/network';
import { useNearest } from '@/lib/useLocation';
import { usePlanner } from '@/store/planner';
import { useNow } from '@/lib/useNow';
import { istParts } from '@/lib/time';
import { useSettings } from '@/store/settings';
import { disruptedLines, useStatus } from '@/store/status';
import { radius, useTheme } from '@/theme';

function greeting(now: number) {
  const h = istParts(now).h;
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function PlanScreen() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { from, to, when, fromIsLocation, set, swap } = usePlanner();
  const { home, work, recents, favourites } = useSettings();
  const status = useStatus();
  const { list: nearby, status: locStatus, refresh: refreshLoc } = useNearest(3, false);
  const [refreshing, setRefreshing] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const now = useNow(60000);

  const nearest = nearby[0];
  const inDelhi = nearest && nearest.km < 40;

  // Default "from" to nearest station
  useEffect(() => {
    if (!from && inDelhi) set({ from: nearest.station.code, fromIsLocation: true });
  }, [from, inDelhi, nearest, set]);

  const go = (f = from, t = to) => {
    if (!f || !t || f === t) return;
    useSettings.getState().addRecent(f, t);
    router.push({ pathname: '/journey', params: { from: f, to: t, at: when ? String(when) : '' } });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([status.refresh(), refreshLoc()]);
    setRefreshing(false);
  };

  const bad = disruptedLines(status.lines);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View>
            <T v="caption" dim>
              {greeting(now)} · Delhi Metro
            </T>
            <T v="display">Where to?</T>
          </View>
          <Press onPress={() => router.push('/lines')} hitSlop={8}>
            <Pill
              text={status.checkedAt ? (bad.length ? `${bad.length} disrupted` : 'All normal') : 'Status'}
              tone={status.checkedAt ? (bad.length ? 'danger' : 'success') : 'neutral'}
              icon={bad.length ? 'exclamationmark.triangle.fill' : 'checkmark.circle.fill'}
            />
          </Press>
        </View>

        <TripBanner />

        <Card pad={0} style={{ overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            <View style={{ width: 36, alignItems: 'center', paddingTop: 22, paddingBottom: 22 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, borderColor: c.text }} />
              <View style={{ flex: 1, width: 2, backgroundColor: c.border, marginVertical: 4 }} />
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c.text }} />
            </View>
            <View style={{ flex: 1 }}>
              <Press onPress={() => router.push({ pathname: '/pick', params: { field: 'from' } })} style={{ paddingVertical: 14, paddingRight: 12 }}>
                <T v="micro" faint>
                  From{fromIsLocation && from ? ' · Nearest to you' : ''}
                </T>
                <T v="h3" numberOfLines={1} style={{ marginTop: 3 }} color={from ? c.text : c.text3}>
                  {from ? getStation(from).name : 'Choose starting station'}
                </T>
              </Press>
              <Divider />
              <Press onPress={() => router.push({ pathname: '/pick', params: { field: 'to' } })} style={{ paddingVertical: 14, paddingRight: 12 }}>
                <T v="micro" faint>
                  To
                </T>
                <T v="h3" numberOfLines={1} style={{ marginTop: 3 }} color={to ? c.text : c.text3}>
                  {to ? getStation(to).name : 'Choose destination'}
                </T>
              </Press>
            </View>
            <Press onPress={swap} accessibilityLabel="Swap stations" style={{ width: 52, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrow.up.arrow.down" size={15} color={c.text2} />
              </View>
            </Press>
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }}>
            <Press
              onPress={() => setShowTime((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: c.surface2,
                borderRadius: radius.pill,
                paddingHorizontal: 12,
                height: 34,
              }}>
              <Icon name="clock" size={13} color={c.text2} />
              <T v="label">{when ? `Depart ${fmtClock(when)}` : 'Leave now'}</T>
            </Press>
            {when ? (
              <Press onPress={() => set({ when: null })} hitSlop={8}>
                <T v="label" color={c.accent}>
                  Now
                </T>
              </Press>
            ) : null}
            <View style={{ flex: 1 }} />
            <Button
              title="Find route"
              icon="arrow.right"
              onPress={() => go()}
              disabled={!from || !to || from === to}
              style={{ height: 40, paddingHorizontal: 14 }}
            />
          </View>
          {showTime ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12, alignItems: 'flex-start' }}>
              <Host matchContents colorScheme={scheme}>
                <DatePicker
                  selection={new Date(when ?? now)}
                  displayedComponents={['date', 'hourAndMinute']}
                  range={{ start: new Date(now - 3600e3) }}
                  onDateChange={(d) => set({ when: d.getTime() })}
                />
              </Host>
            </View>
          ) : null}
        </Card>

        {(home || work) && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {home ? <QuickChip icon="house.fill" title="Home" sub={getStation(home).name} onPress={() => from && go(from, home)} /> : null}
            {work ? <QuickChip icon="briefcase.fill" title="Work" sub={getStation(work).name} onPress={() => from && go(from, work)} /> : null}
          </View>
        )}

        {bad.length ? (
          <>
            <SectionHeader title="Service alerts" />
            <StatusSummary compact />
          </>
        ) : null}

        <SectionHeader title="Nearby" action={locStatus === 'denied' ? 'Enable location' : 'Refresh'} onAction={() => refreshLoc()} />
        <NearbyList nearby={nearby} locStatus={locStatus} onEnable={refreshLoc} />

        {recents.length ? (
          <>
            <SectionHeader title="Recent" action="Clear" onAction={() => useSettings.getState().set({ recents: [] })} />
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {recents.slice(0, 5).map((r, i) => (
                <View key={r.from + r.to}>
                  {i > 0 ? <Divider /> : null}
                  <Press onPress={() => go(r.from, r.to)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 }}>
                    <Icon name="clock.arrow.circlepath" size={16} color={c.text3} />
                    <View style={{ flex: 1 }}>
                      <T v="bodyStrong" numberOfLines={1}>
                        {getStation(r.from).name} → {getStation(r.to).name}
                      </T>
                    </View>
                    <Icon name="chevron.right" size={12} color={c.text3} />
                  </Press>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {favourites.length ? (
          <>
            <SectionHeader title="Saved stations" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {favourites.map((code) => {
                const s = getStation(code);
                return (
                  <Press key={code} onPress={() => router.push({ pathname: '/station/[code]', params: { code } })}>
                    <Card style={{ width: 150, gap: 8 }} pad={12}>
                      <LineDots colors={stationColors(s)} />
                      <T v="bodyStrong" numberOfLines={2}>
                        {s.name}
                      </T>
                    </Card>
                  </Press>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {!bad.length ? (
          <>
            <SectionHeader title="Network status" action="All lines" onAction={() => router.push('/lines')} />
            <StatusSummary compact />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function QuickChip({ icon, title, sub, onPress }: { icon: any; title: string; sub: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} style={{ flex: 1 }}>
      <Card pad={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={14} color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">{title}</T>
          <T v="caption" dim numberOfLines={1}>
            {sub}
          </T>
        </View>
      </Card>
    </Press>
  );
}

function NearbyList({ nearby, locStatus, onEnable }: { nearby: ReturnType<typeof useNearest>['list']; locStatus: string; onEnable: () => void }) {
  if (locStatus === 'denied' || (!nearby.length && locStatus !== 'loading')) {
    return (
      <Card style={{ alignItems: 'flex-start', gap: 10 }}>
        <T v="bodyStrong">Find stations near you</T>
        <T v="caption" dim>
          Allow location access to see the nearest metro stations, walking time and their last trains.
        </T>
        <Button title="Use my location" icon="location.fill" kind="secondary" onPress={onEnable} style={{ height: 40 }} />
      </Card>
    );
  }
  if (!nearby.length) {
    return (
      <Card>
        <T v="caption" dim>
          Locating…
        </T>
      </Card>
    );
  }
  if (nearby[0].km > 40) {
    return (
      <Card style={{ gap: 6 }}>
        <T v="bodyStrong">You’re outside Delhi NCR</T>
        <T v="caption" dim>
          The nearest Delhi Metro station ({nearby[0].station.name}) is {Math.round(nearby[0].km)} km away. Nearby suggestions will appear when you’re in the
          city.
        </T>
      </Card>
    );
  }
  return (
    <Card pad={0} style={{ paddingHorizontal: 14 }}>
      {nearby.map(({ station, km }, i) => (
        <View key={station.code}>
          {i > 0 ? <Divider /> : null}
          <NearbyRow code={station.code} km={km} />
        </View>
      ))}
    </Card>
  );
}

function NearbyRow({ code, km }: { code: string; km: number }) {
  const { c } = useTheme();
  const s = getStation(code);
  const lastInfo = useMemo(() => {
    const dirs = directionsAt(code);
    const lasts = dirs.filter((d) => d.timing.last).sort((a, b) => (a.timing.last! < b.timing.last! ? -1 : 1));
    if (!lasts.length) return null;
    const earliest = lasts[0];
    return `Last train ${hm(earliest.timing.last)} towards ${titleTowards(earliest.timing.to)}`;
  }, [code]);
  return (
    <Press
      onPress={() => router.push({ pathname: '/station/[code]', params: { code } })}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      <View style={{ width: 40, alignItems: 'center' }}>
        <T v="bodyStrong">{walkMin(km)}</T>
        <T v="micro" faint style={{ textTransform: 'none' }}>
          min
        </T>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {s.name}
          </T>
          <LineDots colors={stationColors(s)} size={8} />
        </View>
        <T v="caption" dim numberOfLines={2}>
          {fmtKm(km)} away{lastInfo ? ` · ${lastInfo}` : ''}
        </T>
      </View>
      <Press
        hitSlop={6}
        onPress={() => {
          usePlanner.getState().set({ from: code, fromIsLocation: false });
        }}
        style={{ paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: c.surface2, justifyContent: 'center' }}>
        <T v="label">From here</T>
      </Press>
    </Press>
  );
}
