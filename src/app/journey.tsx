import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JourneyLegs } from '@/components/journey-view';
import { Button, Card, Icon, Press, T } from '@/components/ui';
import { NoServiceError, planOnline } from '@/lib/api';
import { fareFor } from '@/lib/fare';
import { fmtClock, fmtDuration, hm } from '@/lib/format';
import { getLine, getStation, lineLabel, stationByCode } from '@/lib/network';
import { planOffline, type Journey } from '@/lib/router';
import { checkServiceHours } from '@/lib/service';
import { plannedStart, startTrip } from '@/lib/trip';
import { useNow } from '@/lib/useNow';
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
  const { from, to, at } = useLocalSearchParams<{ from: string; to: string; at?: string }>();
  // deep links can carry anything: don't crash on unknown stations
  if (!stationByCode.has(from) || !stationByCode.has(to) || from === to) return <InvalidJourney />;
  return <JourneyView from={from} to={to} at={at} />;
}

function InvalidJourney() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Stack.Screen options={{ title: '' }} />
      <T v="h3">Can’t plan this route</T>
      <Button title="Back" kind="secondary" onPress={() => router.back()} />
    </View>
  );
}

function JourneyView({ from, to, at }: { from: string; to: string; at?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(60e3);
  const when = useMemo(() => (at ? new Date(Number(at)) : new Date()), [at]);
  const offlineOptions = useMemo(
    () => dedupe([planOffline(from, to, 'fastest'), planOffline(from, to, 'fewest-changes')].filter(Boolean) as Journey[]),
    [from, to],
  );
  const [online, setOnline] = useState<{ key: string; list: Journey[] | null; noService: boolean } | null>(null);
  const [sel, setSel] = useState(0);
  const reqKey = `${from}|${to}|${when.getTime()}`;
  const loading = online?.key !== reqKey;
  const noService = !loading && !!online?.noService;
  const offline = !loading && !online?.list && !noService;
  const options = !loading && online?.list ? online.list : offlineOptions;
  const [starting, setStarting] = useState(false);
  const lineStatus = useStatus((s) => s.lines);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([planOnline(from, to, when, 'least-distance'), planOnline(from, to, when, 'minimum-interchange')]).then((res) => {
      if (!alive) return;
      const ok = res.filter((r): r is PromiseFulfilledResult<Journey> => r.status === 'fulfilled').map((r) => r.value);
      const noSvc = !ok.length && res.some((r) => r.status === 'rejected' && r.reason instanceof NoServiceError);
      setOnline({ key: reqKey, list: ok.length ? dedupe(ok).sort((a, b) => a.totalS - b.totalS) : null, noService: noSvc });
      setSel(0);
    });
    return () => {
      alive = false;
    };
  }, [from, to, when, reqKey]);

  const j = options[Math.min(sel, options.length - 1)];
  const fromS = getStation(from);
  const toS = getStation(to);

  // Service hours for every leg against its own direction's first/last train (IST service-day minutes).
  // "Leave now" re-checks every minute while the screen stays open.
  const checkAt = at ? Number(at) : now;
  const issue = j ? checkServiceHours(j, checkAt) : null;
  const noTrainsOnline = j?.source === 'dmrc' && j.legs.some((l) => !l.depart);
  const afterLast = noService || noTrainsOnline || issue?.kind === 'after-last';
  const beforeFirst = !afterLast && issue?.kind === 'before-first';
  const nearLast = !afterLast && issue?.kind === 'near-last';
  const fare = j ? fareFor(j, when.getTime()) : null;
  const affected = j ? [...new Set(j.legs.map((l) => l.lineId))].filter((id) => !isNormal(lineStatus[id])) : [];

  const depart = j ? plannedStart(j, when.getTime()) : 0;
  const lastArrive = j?.legs[j.legs.length - 1].arrive;
  const departLabel = j?.legs[0].depart ? hm(j.legs[0].depart) : j ? fmtClock(depart) : '';
  const arriveLabel = lastArrive ? hm(lastArrive) : j ? fmtClock(depart + j.totalS * 1000) : '';
  const departLabelFull = departLabel && arriveLabel ? `${departLabel} → ${arriveLabel}` : '';

  const onStart = async () => {
    if (!j) return;
    setStarting(true);
    try {
      // waits for the planner's train, or the first train before service starts
      const res = await startTrip(j);
      if (res === 'denied') {
        Alert.alert(
          'Tracking by schedule',
          'Location is off, so Mettro will follow the timetable. You can tap a station on the trip screen to correct your position.',
        );
      }
      router.replace('/trip');
    } catch (e) {
      Alert.alert('Couldn’t start the trip', String((e as Error)?.message ?? e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 110 }}>
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
            <View style={{ gap: 4, marginBottom: 24 }}>
              <T v="label" dim>
                From {fromS.name}
              </T>
              <T v="title">{toS.name}</T>
            </View>

            {options.length > 1 ? (
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20, backgroundColor: c.surface2, padding: 4, borderRadius: radius.lg }}>
                {options.map((o, i) => (
                  <Press
                    key={o.id}
                    onPress={() => setSel(i)}
                    accessibilityState={{ selected: i === sel }}
                    style={{ flex: 1, padding: 12, borderRadius: radius.md, gap: 4, backgroundColor: i === sel ? c.surface : 'transparent' }}>
                    <T v="label" color={i === sel ? c.text : c.text2}>
                      {i === 0 ? 'Fastest' : o.interchanges < options[0].interchanges ? 'Fewer changes' : 'Alternative'}
                    </T>
                    <T v="bodyStrong">{fmtDuration(o.totalS)}</T>
                    <T v="caption" dim>
                      {o.interchanges ? `${o.interchanges} change${o.interchanges > 1 ? 's' : ''}` : 'Direct'}
                    </T>
                  </Press>
                ))}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 16, paddingHorizontal: 2 }}>
              <T v="display" style={{ flex: 1 }}>
                {fmtDuration(j.totalS)}
              </T>
              <T v="h2" dim={j.fareSource === 'estimate'}>
                {fare != null ? `${j.fareSource === 'estimate' ? '~' : ''}₹${fare}` : ''}
              </T>
            </View>
            <T v="label" dim style={{ marginTop: 6, paddingHorizontal: 2 }}>
              {[departLabelFull, j.interchanges ? `${j.interchanges} change${j.interchanges > 1 ? 's' : ''}` : 'Direct'].filter(Boolean).join('  ·  ')}
            </T>

            {offline ? <Notice icon="wifi.slash" tone="warn" text="Offline — times and fare are estimates." /> : null}
            {afterLast ? (
              <Notice
                icon="moon.zzz.fill"
                tone="danger"
                text={
                  issue?.kind === 'after-last'
                    ? `Last train from ${issue.station} towards ${issue.towards} has left. First train ${hm(issue.timing.first)}.`
                    : 'No trains for this trip right now.'
                }
              />
            ) : null}
            {beforeFirst && issue ? (
              <Notice icon="sunrise.fill" tone="warn" text={`Service starts at ${hm(issue.timing.first)} from ${issue.station}.`} />
            ) : null}
            {nearLast && issue ? (
              <Notice
                icon="exclamationmark.triangle.fill"
                tone="warn"
                text={`Last train from ${issue.station} towards ${issue.towards} at ${hm(issue.timing.last)}.`}
              />
            ) : null}
            {affected.length ? (
              <Notice
                icon="exclamationmark.octagon.fill"
                tone="danger"
                text={affected.map((id) => `${lineLabel(getLine(id))}: ${lineStatus[id]}`).join(' · ')}
              />
            ) : null}

            <Card style={{ marginTop: 24, paddingVertical: 24 }} pad={12}>
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
          <Button title="Start trip" icon="arrow.right" onPress={onStart} loading={starting} disabled={afterLast} />
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
