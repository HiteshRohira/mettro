import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JourneyLegs, JourneySummaryLine } from '@/components/journey-view';
import { Button, Card, Icon, Press, T } from '@/components/ui';
import { planOnline } from '@/lib/api';
import { fmtClock, fmtDuration, hm, hmToMinutes } from '@/lib/format';
import { DIR_TIMINGS, getLine, getStation, lineLabel, titleTowards } from '@/lib/network';
import { planOffline, type Journey } from '@/lib/router';
import { plannedStart, startTrip } from '@/lib/trip';
import { useStatus, isNormal } from '@/store/status';
import { radius, useTheme } from '@/theme';

function dedupe(list: Journey[]) {
  const seen = new Set<string>();
  return list.filter((j) => {
    const k = j.legs.map((l) => `${l.lineId}:${l.stations[0]}:${l.stations[l.stations.length - 1]}`).join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function JourneyScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { from, to, at } = useLocalSearchParams<{ from: string; to: string; at?: string }>();
  const when = useMemo(() => (at ? new Date(Number(at)) : new Date()), [at]);
  const offlineOptions = useMemo(
    () => dedupe([planOffline(from, to, 'fastest'), planOffline(from, to, 'fewest-changes')].filter(Boolean) as Journey[]),
    [from, to],
  );
  const [online, setOnline] = useState<{ key: string; list: Journey[] | null } | null>(null);
  const [sel, setSel] = useState(0);
  const reqKey = `${from}|${to}|${when.getTime()}`;
  const loading = online?.key !== reqKey;
  const offline = !loading && !online?.list;
  const options = !loading && online?.list ? online.list : offlineOptions;
  const [starting, setStarting] = useState(false);
  const lineStatus = useStatus((s) => s.lines);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([planOnline(from, to, when, 'least-distance'), planOnline(from, to, when, 'minimum-interchange')]).then((res) => {
      if (!alive) return;
      const ok = res.filter((r): r is PromiseFulfilledResult<Journey> => r.status === 'fulfilled').map((r) => r.value);
      setOnline({ key: reqKey, list: ok.length ? dedupe(ok).sort((a, b) => a.totalS - b.totalS) : null });
      setSel(0);
    });
    return () => {
      alive = false;
    };
  }, [from, to, when, reqKey]);

  const j = options[Math.min(sel, options.length - 1)];
  const fromS = getStation(from);
  const toS = getStation(to);

  // Service-hours check for the first boarding
  const firstLeg = j?.legs[0];
  const dirTiming = firstLeg ? DIR_TIMINGS[`${firstLeg.stations[0]}|${firstLeg.stations[1]}`] : undefined;
  const nowMin = when.getHours() * 60 + when.getMinutes();
  const lastMin = hmToMinutes(dirTiming?.last);
  const firstMin = hmToMinutes(dirTiming?.first);
  const noTrainsOnline = j?.source === 'dmrc' && j.legs.some((l) => !l.depart);
  const afterLast = noTrainsOnline || (lastMin !== null && nowMin >= 20 * 60 && nowMin > lastMin);
  const beforeFirst = !afterLast && firstMin !== null && nowMin < firstMin && nowMin < 7 * 60;
  const nearLast = !afterLast && lastMin !== null && nowMin >= lastMin - 45 && nowMin <= lastMin;
  const affected = j ? [...new Set(j.legs.map((l) => l.lineId))].filter((id) => !isNormal(lineStatus[id])) : [];

  const depart = j ? plannedStart(j, when.getTime()) : 0;
  const lastArrive = j?.legs[j.legs.length - 1].arrive;
  const departLabel = j?.legs[0].depart ? hm(j.legs[0].depart) : j ? fmtClock(depart) : '';
  const arriveLabel = lastArrive ? hm(lastArrive) : j ? fmtClock(depart + j.totalS * 1000) : '';
  const departLabelFull = departLabel && arriveLabel ? `${departLabel} → ${arriveLabel}` : '';

  const onStart = async () => {
    if (!j) return;
    setStarting(true);
    const isNow = !at || Math.abs(Number(at) - Date.now()) < 10 * 60e3;
    const res = await startTrip(j, isNow ? undefined : Date.now() + 60e3);
    setStarting(false);
    if (res === 'denied') {
      Alert.alert(
        'Tracking by schedule',
        'Location is off, so Mettro will follow the timetable. You can tap a station on the trip screen to correct your position.',
      );
    }
    router.replace('/trip');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `${fromS.name} → ${toS.name}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 110 }}>
        {!j ? (
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : (
            <Card>
              <T v="bodyStrong">No route found</T>
            </Card>
          )
        ) : (
          <>
            <View style={{ paddingHorizontal: 4, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <T v="display">{fmtDuration(j.totalS)}</T>
                <T v="h2" dim={j.fareSource === 'estimate'}>
                  {j.fare != null ? `${j.fareSource === 'estimate' ? '~' : ''}₹${j.fare}` : ''}
                </T>
              </View>
              <T v="label" dim>
                {[
                  departLabelFull,
                  j.interchanges ? `${j.interchanges} change${j.interchanges > 1 ? 's' : ''}` : 'Direct',
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </T>
            </View>

            {options.length > 1 ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                {options.map((o, i) => (
                  <Press key={o.id} onPress={() => setSel(i)} style={{ flex: 1 }} accessibilityState={{ selected: i === sel }}>
                    <View
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: radius.md,
                        gap: 6,
                        backgroundColor: i === sel ? c.surface : 'transparent',
                        borderWidth: 1,
                        borderColor: i === sel ? c.text : c.border,
                      }}>
                      <T v="bodyStrong">{fmtDuration(o.totalS)}</T>
                      <JourneySummaryLine j={o} />
                    </View>
                  </Press>
                ))}
              </View>
            ) : null}

            {offline ? <Notice icon="wifi.slash" tone="warn" text="Offline — times and fare are estimates." /> : null}
            {afterLast ? (
              <Notice
                icon="moon.zzz.fill"
                tone="danger"
                text={`Last train towards ${titleTowards(dirTiming?.to) || firstLeg?.towards} has left. First train ${hm(dirTiming?.first)}.`}
              />
            ) : null}
            {beforeFirst ? (
              <Notice icon="sunrise.fill" tone="warn" text={`Service starts at ${hm(dirTiming?.first)}.`} />
            ) : null}
            {nearLast ? (
              <Notice
                icon="exclamationmark.triangle.fill"
                tone="warn"
                text={`Last train towards ${firstLeg?.towards} at ${hm(dirTiming?.last)}.`}
              />
            ) : null}
            {affected.length ? (
              <Notice
                icon="exclamationmark.octagon.fill"
                tone="danger"
                text={affected.map((id) => `${lineLabel(getLine(id))}: ${lineStatus[id]}`).join(' · ')}
              />
            ) : null}

            <Card style={{ marginTop: 16, paddingVertical: 18 }} pad={8}>
              <JourneyLegs j={j} />
            </Card>
            {loading ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 }}>
                <ActivityIndicator size="small" />
                <T v="caption" faint>
                  Getting live times…
                </T>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      {j ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 16,
            paddingBottom: insets.bottom + 10,
            backgroundColor: c.bg,
          }}>
          <Button title="Start trip" onPress={onStart} loading={starting} disabled={afterLast && !loading} />
        </View>
      ) : null}
    </View>
  );
}

function Notice({ icon, text, tone }: { icon: any; text: string; tone: 'warn' | 'danger' }) {
  const { c } = useTheme();
  const bg = tone === 'warn' ? c.warnSoft : c.dangerSoft;
  const fg = tone === 'warn' ? c.warn : c.danger;
  return (
    <View style={{ flexDirection: 'row', gap: 10, backgroundColor: bg, borderRadius: radius.md, padding: 12, marginTop: 16, alignItems: 'flex-start' }}>
      <Icon name={icon} size={16} color={fg} style={{ marginTop: 1 }} />
      <T v="caption" color={fg} style={{ flex: 1, fontFamily: 'Inter-Medium' }}>
        {text}
      </T>
    </View>
  );
}
