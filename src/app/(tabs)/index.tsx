import { TimePicker } from '@/components/platform/time-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openTrip, SavedTripRow, tripMenu } from '@/components/saved-trips';
import { ServiceAlerts } from '@/components/status';
import { TripBanner } from '@/components/trip-banner';
import { Button, Card, Divider, Icon, LineDots, Press, SectionHeader, T } from '@/components/ui';
import { fmtClock, hm, walkMin } from '@/lib/format';
import { directionsAt, getStation, stationColors, titleTowards } from '@/lib/network';
import { rankTrips } from '@/lib/savedTrips';
import { useNearest } from '@/lib/useLocation';
import { serviceMinutes, timetableMinutes } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { usePlanner } from '@/store/planner';
import { useSettings } from '@/store/settings';
import { useStatus } from '@/store/status';
import { radius, useTheme } from '@/theme';

export default function PlanScreen() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { from, to, when, fromIsLocation, set, swap } = usePlanner();
  const { trips, favourites } = useSettings();
  const refreshStatus = useStatus((s) => s.refresh);
  const { list: nearby, coords, status: locStatus, refresh: refreshLoc } = useNearest(3, false);
  const ranked = useMemo(() => rankTrips(trips, coords), [trips, coords]);
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
    router.push({ pathname: '/journey', params: { from: f, to: t, at: when ? String(when) : '' } });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshStatus(), refreshLoc()]);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled">
        <T v="display" style={{ marginBottom: 24 }}>
          Where to?
        </T>

        <TripBanner />
        <ServiceAlerts style={{ marginBottom: 12 }} />

        <Card pad={0} style={{ overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            <View style={{ width: 44, alignItems: 'center', paddingTop: 36, paddingBottom: 36 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: c.text2 }} />
              <View style={{ flex: 1, width: 2, backgroundColor: c.border, marginVertical: 4 }} />
              <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: c.text }} />
            </View>
            <View style={{ flex: 1 }}>
              <StationField
                value={from}
                placeholder="From"
                hint={fromIsLocation && from ? 'location.fill' : undefined}
                onPress={() => router.push({ pathname: '/pick', params: { field: 'from' } })}
              />
              <Divider />
              <StationField value={to} placeholder="To" onPress={() => router.push({ pathname: '/pick', params: { field: 'to' } })} />
            </View>
            <Press onPress={swap} accessibilityLabel="Swap stations" style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrow.up.arrow.down" size={15} color={c.text3} />
            </Press>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10 }}>
            <Press
              onPress={() => setShowTime((v) => !v)}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minHeight: 44 }}
              accessibilityLabel="Departure time"
              accessibilityState={{ expanded: showTime }}>
              <Icon name="clock" size={13} color={when ? c.text : c.text3} />
              <T v="label" color={when ? c.text : c.text2}>
                {when ? `Depart ${fmtClock(when)}` : 'Leave now'}
              </T>
              <Icon name={showTime ? 'chevron.up' : 'chevron.down'} size={10} color={c.text3} />
            </Press>
            {when ? (
              <Press
                onPress={() => {
                  set({ when: null });
                  setShowTime(false);
                }}
                style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
                <T v="label" color={c.accent}>
                  Reset
                </T>
              </Press>
            ) : null}
          </View>
          {showTime ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12, alignItems: 'flex-start' }}>
              <TimePicker value={when} now={now} onChange={(ms) => set({ when: ms })} scheme={scheme} />
            </View>
          ) : null}
          <Button
            title="Find route"
            icon="arrow.right"
            onPress={() => go()}
            disabled={!from || !to || from === to}
            style={{ margin: 12, marginTop: 0, height: 52, borderRadius: radius.lg }}
          />
        </Card>

        <SectionHeader
          title="Trips"
          action={trips.length > 3 ? 'View all' : undefined}
          onAction={() => router.push('/trips')}
        />
        {ranked.length ? (
          <Card pad={0} style={{ paddingHorizontal: 14 }}>
            {ranked.slice(0, 3).map((r, i) => (
              <View key={r.trip.id}>
                {i > 0 ? <Divider /> : null}
                <SavedTripRow
                  trip={r.trip}
                  from={r.from}
                  near={r.near}
                  onPress={() => openTrip(r.trip, coords)}
                  onLongPress={() => tripMenu(r.trip, r.from)}
                  longPressLabel="Rename or delete"
                />
              </View>
            ))}
          </Card>
        ) : (
          <T v="caption" dim style={{ paddingHorizontal: 4 }}>
            Save a route to get here in one tap.
          </T>
        )}

        <NearbySection nearby={nearby} locStatus={locStatus} onEnable={refreshLoc} now={now} />

        {favourites.length ? (
          <>
            <SectionHeader title="Saved stations" />
            <View style={{ paddingHorizontal: 4 }}>
              {favourites.map((code, i) => (
                <View key={code}>
                  {i > 0 ? <Divider /> : null}
                  <StationRow code={code} />
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StationField({ value, placeholder, hint, onPress }: { value: string | null; placeholder: string; hint?: 'location.fill'; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      onPress={onPress}
      style={{ minHeight: 80, justifyContent: 'center', paddingRight: 4, paddingVertical: 12 }}
      accessibilityLabel={`${placeholder}${value ? ` ${getStation(value).name}` : ''}`}>
      <T v="caption" dim style={{ marginBottom: 3 }}>
        {placeholder}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <T v="h2" numberOfLines={2} color={value ? c.text : c.text3} style={{ flexShrink: 1 }}>
          {value ? getStation(value).name : 'Choose station'}
        </T>
        {hint ? <Icon name={hint} size={11} color={c.accent} /> : null}
      </View>
    </Press>
  );
}

function NearbySection({
  nearby,
  locStatus,
  onEnable,
  now,
}: {
  nearby: ReturnType<typeof useNearest>['list'];
  locStatus: string;
  onEnable: () => void;
  now: number;
}) {
  const { c } = useTheme();
  // Outside Delhi NCR, nearby stations are meaningless — say nothing.
  if (nearby.length && nearby[0].km > 40) return null;
  if (locStatus === 'denied' || (!nearby.length && locStatus !== 'loading')) {
    return (
      <>
        <SectionHeader title="Nearby" />
        <Press onPress={onEnable}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="location" size={15} color={c.accent} />
            <T v="body" color={c.accent} style={{ flex: 1 }}>
              Show stations near me
            </T>
          </Card>
        </Press>
      </>
    );
  }
  if (!nearby.length) return null;
  return (
    <>
      <SectionHeader title="Nearby" />
      <View style={{ paddingHorizontal: 4 }}>
        {nearby.map(({ station, km }, i) => (
          <View key={station.code}>
            {i > 0 ? <Divider /> : null}
            <StationRow code={station.code} walk={walkMin(km)} now={now} />
          </View>
        ))}
      </View>
    </>
  );
}

/** Only surface the last train when it actually matters: within the hour before it leaves. */
function useLastTrainWarning(code: string, now?: number) {
  return useMemo(() => {
    if (now == null) return null;
    // service-day minutes in IST (00:00–02:59 count as 24:00+), whatever the phone's timezone
    const nowMin = serviceMinutes(now);
    const lasts = directionsAt(code)
      .filter((x) => x.timing.last)
      .map((x) => ({ min: timetableMinutes(x.timing.last)!, x }))
      .sort((a, b) => a.min - b.min);
    const soonest = lasts.find((l) => l.min >= nowMin);
    if (!soonest || soonest.min - nowMin > 60) return null;
    return `Last train ${hm(soonest.x.timing.last)} to ${titleTowards(soonest.x.timing.to)}`;
  }, [code, now]);
}

function StationRow({ code, walk, now }: { code: string; walk?: number; now?: number }) {
  const { c } = useTheme();
  const s = getStation(code);
  const warn = useLastTrainWarning(code, now);
  return (
    <Press
      onPress={() => router.push({ pathname: '/station/[code]', params: { code } })}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T v="body" numberOfLines={1} style={{ flexShrink: 1 }}>
            {s.name}
          </T>
          <LineDots colors={stationColors(s)} size={7} />
        </View>
        {warn ? (
          <T v="caption" color={c.warn} numberOfLines={1}>
            {warn}
          </T>
        ) : null}
      </View>
      {walk != null ? (
        <T v="label" faint>
          {walk} min
        </T>
      ) : null}
    </Press>
  );
}
