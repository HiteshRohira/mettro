import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JourneyLegs, JourneySummaryLine } from '@/components/journey-view';
import { Button, Card, Icon, Pill, Press, T } from '@/components/ui';
import { planOnline } from '@/lib/api';
import { fmtClock, fmtDuration, hm, hmToMinutes } from '@/lib/format';
import { DIR_TIMINGS, getStation, titleTowards } from '@/lib/network';
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
  const arrive = j ? (j.legs[j.legs.length - 1].arrive ? null : depart + j.totalS * 1000) : 0;

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
        {options.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 14 }}>
            {options.map((o, i) => (
              <Press key={o.id} onPress={() => setSel(i)}>
                <View
                  style={{
                    padding: 12,
                    borderRadius: radius.lg,
                    minWidth: 170,
                    gap: 6,
                    backgroundColor: c.surface,
                    borderWidth: i === sel ? 2 : 1,
                    borderColor: i === sel ? c.text : c.border,
                  }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T v="h3">{fmtDuration(o.totalS)}</T>
                    <T v="label" dim>
                      {o.fare != null ? `₹${o.fare}` : ''}
                    </T>
                  </View>
                  <JourneySummaryLine j={o} />
                  <T v="caption" dim>
                    {o.interchanges === 0 ? 'Direct' : `${o.interchanges} change${o.interchanges > 1 ? 's' : ''}`} · {o.stops} stops
                  </T>
                </View>
              </Press>
            ))}
          </ScrollView>
        ) : null}

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
            <Card style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View>
                  <T v="micro" faint>
                    Journey time
                  </T>
                  <T v="title">{fmtDuration(j.totalS)}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T v="micro" faint>
                    {when.getDay() === 0 ? 'Sunday fare' : 'Token fare'}
                  </T>
                  <T v="title">{j.fare != null ? `₹${j.fare}` : '—'}</T>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pill text={`${j.stops} stops`} icon="smallcircle.filled.circle" />
                <Pill text={j.interchanges ? `${j.interchanges} change${j.interchanges > 1 ? 's' : ''}` : 'No changes'} icon="arrow.triangle.swap" />
                {j.legs[0].depart ? <Pill text={`Departs ${hm(j.legs[0].depart)}`} icon="clock" tone="accent" /> : null}
                {j.legs[j.legs.length - 1].arrive ? (
                  <Pill text={`Arrives ${hm(j.legs[j.legs.length - 1].arrive)}`} icon="flag.checkered" tone="accent" />
                ) : arrive ? (
                  <Pill text={`~Arrive ${fmtClock(arrive)}`} icon="flag.checkered" />
                ) : null}
              </View>
              {j.fareSource === 'estimate' ? (
                <T v="caption" faint>
                  {j.fare == null
                    ? 'Fare depends on the Airport Express / Rapid Metro section — check at the station.'
                    : 'Estimated fare (offline). Smart card / QR users get a 10% discount; off-peak extra 10%.'}
                </T>
              ) : (
                <T v="caption" faint>
                  Fare and timings from the DMRC journey planner. Smart cards get 10% off (more off-peak).
                </T>
              )}
            </Card>

            {offline ? <Notice icon="wifi.slash" tone="warn" text="Couldn’t reach DMRC — showing an offline route with estimated times and fare." /> : null}
            {afterLast ? (
              <Notice
                icon="moon.zzz.fill"
                tone="danger"
                text={`The last train from ${fromS.name} towards ${titleTowards(dirTiming?.to) || firstLeg?.towards} has left (${hm(dirTiming?.last)}). First train tomorrow: ${hm(dirTiming?.first)}.`}
              />
            ) : null}
            {beforeFirst ? (
              <Notice icon="sunrise.fill" tone="warn" text={`Service hasn’t started yet. First train from ${fromS.name}: ${hm(dirTiming?.first)}.`} />
            ) : null}
            {nearLast ? (
              <Notice
                icon="exclamationmark.triangle.fill"
                tone="warn"
                text={`Hurry — last train from ${fromS.name} towards ${firstLeg?.towards} is at ${hm(dirTiming?.last)}.`}
              />
            ) : null}
            {affected.length ? (
              <Notice
                icon="exclamationmark.octagon.fill"
                tone="danger"
                text={`Service alert on ${affected.map((id) => `${id}: ${lineStatus[id]}`).join(', ')}. Expect delays.`}
              />
            ) : null}

            <Card style={{ marginTop: 12, paddingVertical: 18 }} pad={8}>
              <JourneyLegs j={j} />
            </Card>
            {loading ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 }}>
                <ActivityIndicator size="small" />
                <T v="caption" dim>
                  Getting live timings from DMRC…
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
            borderTopWidth: 0.5,
            borderTopColor: c.border,
          }}>
          <Button title="Start trip" icon="location.north.line.fill" onPress={onStart} loading={starting} disabled={afterLast && !loading} />
          <T v="caption" faint style={{ textAlign: 'center', marginTop: 8 }}>
            Live Activity on your Lock Screen & Dynamic Island, stop by stop
          </T>
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
    <View style={{ flexDirection: 'row', gap: 10, backgroundColor: bg, borderRadius: radius.md, padding: 12, marginTop: 12, alignItems: 'flex-start' }}>
      <Icon name={icon} size={16} color={fg} style={{ marginTop: 1 }} />
      <T v="caption" color={fg} style={{ flex: 1, fontFamily: 'Inter-Medium' }}>
        {text}
      </T>
    </View>
  );
}
