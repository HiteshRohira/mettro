import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Divider, Icon, LineChip, Pill, Press, Row, SectionHeader, T } from '@/components/ui';
import { fetchStationLive, type StationLive } from '@/lib/api';
import { getDetails } from '@/lib/details';
import { hm } from '@/lib/format';
import { directionsAt, getLine, getStation, lineLabel, linesOf, stationByCode, titleTowards } from '@/lib/network';
import { usePlanner } from '@/store/planner';
import { useSettings } from '@/store/settings';
import { isNormal, useStatus } from '@/store/status';
import { useTheme } from '@/theme';

const FAC_ICON: Record<string, any> = {
  Toilet: 'toilet.fill',
  'Token/Automatic Vending Machine': 'ticket.fill',
  'Medical/Health': 'cross.case.fill',
  ATM: 'banknote.fill',
  'Food / Restaurant': 'fork.knife',
  'Shop/Office': 'bag.fill',
  Travel: 'airplane',
  Kiosk: 'storefront.fill',
  Water: 'drop.fill',
  'Police Booth': 'shield.fill',
  'Baby Care Room': 'figure.and.child.holdinghands',
  Bank: 'building.columns.fill',
  Locker: 'lock.fill',
  'Cloak Room': 'hanger',
};

export default function StationScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();
  const s = stationByCode.get(code);
  const d = useMemo(() => getDetails(code), [code]);
  const { favourites, home, work } = useSettings();
  const lineStatus = useStatus((st) => st.lines);
  const [live, setLive] = useState<StationLive | null>(null);
  const [showAllGates, setShowAllGates] = useState(false);
  const [showLifts, setShowLifts] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchStationLive(code)
      .then((r) => alive && setLive(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code]);

  if (!s) return null;
  const lines = linesOf(s);
  const fav = favourites.includes(code);
  const dirs = directionsAt(code);
  const gates = (live?.gates?.length ? d?.gates.map((g) => ({ ...g, open: live.gates.find((x) => x.name === g.name)?.open ?? g.open })) : d?.gates) ?? [];
  const closedGates = gates.filter((g) => !g.open);
  const alerts = live?.status?.length ? live.status : (d?.status ?? []);
  const lifts = d?.lifts.filter((l) => l.type === 'Lift') ?? [];
  const escalators = d?.lifts.filter((l) => l.type !== 'Lift') ?? [];

  const more = () => {
    const opts = ['Set as Home', 'Set as Work', 'Open in Maps', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: 3, title: s.name }, (i) => {
      if (i === 0) useSettings.getState().set({ home: code });
      if (i === 1) useSettings.getState().set({ work: code });
      if (i === 2) Linking.openURL(`http://maps.apple.com/?ll=${s.lat},${s.lng}&q=${encodeURIComponent(s.name + ' Metro Station')}`);
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 18 }}>
              <Press onPress={() => useSettings.getState().toggleFav(code)} hitSlop={8} accessibilityLabel={fav ? 'Remove from saved' : 'Save station'}>
                <Icon name={fav ? 'star.fill' : 'star'} size={20} color={fav ? '#F5B301' : c.text} />
              </Press>
              <Press onPress={more} hitSlop={8} accessibilityLabel="More">
                <Icon name="ellipsis.circle" size={20} />
              </Press>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {lines.map((l) => (
            <Press key={l.id} onPress={() => router.push({ pathname: '/line/[id]', params: { id: l.id } })}>
              <LineChip line={l} label={lineLabel(l)} />
            </Press>
          ))}
        </View>
        <T v="display" style={{ marginTop: 10 }}>
          {s.name}
        </T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {s.type ? <Pill text={s.type} icon={s.type === 'Underground' ? 'arrow.down.to.line' : 'arrow.up.to.line'} /> : null}
          {s.interchange ? <Pill text="Interchange" icon="arrow.triangle.swap" tone="accent" /> : null}
          {s.tags.includes('Divyang Friendly Station') ? <Pill text="Accessible" icon="figure.roll" tone="success" /> : null}
          {s.tags.includes('Parking Available') ? <Pill text="Parking" icon="parkingsign" /> : null}
          {home === code ? <Pill text="Home" icon="house.fill" tone="accent" /> : null}
          {work === code ? <Pill text="Work" icon="briefcase.fill" tone="accent" /> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Button
            title="Route from"
            kind="secondary"
            icon="arrow.up.right"
            style={{ flex: 1 }}
            onPress={() => {
              usePlanner.getState().set({ from: code, fromIsLocation: false });
              router.dismissTo('/');
            }}
          />
          <Button
            title="Route to"
            icon="flag.fill"
            style={{ flex: 1 }}
            onPress={() => {
              const p = usePlanner.getState();
              p.set({ to: code });
              if (p.from && p.from !== code) router.push({ pathname: '/journey', params: { from: p.from, to: code } });
              else router.dismissTo('/');
            }}
          />
        </View>

        {alerts.length || lines.some((l) => !isNormal(lineStatus[l.id])) || closedGates.length ? (
          <Card style={{ marginTop: 16, backgroundColor: c.warnSoft, borderColor: 'transparent', gap: 6 }}>
            {lines
              .filter((l) => !isNormal(lineStatus[l.id]))
              .map((l) => (
                <T key={l.id} v="label" color={c.warn}>
                  {lineLabel(l)}: {lineStatus[l.id]}
                </T>
              ))}
            {alerts.map((a, i) => (
              <T key={i} v="label" color={c.warn}>
                {[a.title, a.note].filter(Boolean).join(' — ') || a.status}
              </T>
            ))}
            {closedGates.length ? (
              <T v="label" color={c.warn}>
                Closed: {closedGates.map((g) => g.name).join(', ')}
              </T>
            ) : null}
          </Card>
        ) : null}

        <SectionHeader title="First & last trains" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          {dirs.length ? (
            dirs.map((dir, i) => {
              const l = getLine(dir.line);
              return (
                <View key={dir.neighbour}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: l.color }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T v="bodyStrong" numberOfLines={1}>
                        To {titleTowards(dir.timing.to)}
                      </T>
                      <T v="caption" dim numberOfLines={1}>
                        {lineLabel(l)}
                        {dir.timing.platform ? ` · ${dir.timing.platform}` : ''} · next stop {getStation(dir.neighbour).name}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T v="mono">{hm(dir.timing.first)}</T>
                      <T v="mono" color={c.danger}>
                        {hm(dir.timing.last)}
                      </T>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={{ paddingVertical: 14 }}>
              <T v="caption" dim>
                Station hours {s.open || '—'} – {s.close || '—'}
              </T>
            </View>
          )}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
            <T v="caption" faint>
              Top: first train · Red: last train · DMRC timetable
            </T>
          </View>
        </Card>

        {d?.platforms?.length ? (
          <>
            <SectionHeader title="Platforms" />
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {d.platforms.map((p, i) => (
                <View key={p.name}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 }}>
                    <View
                      style={{
                        minWidth: 34,
                        height: 26,
                        borderRadius: 6,
                        backgroundColor: c.surface2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 6,
                      }}>
                      <T v="label">{p.name.replace(/Platform No\.?\s*/i, '').replace(/\s*\(.*\)/, '') || p.name}</T>
                    </View>
                    <T v="body" style={{ flex: 1 }} numberOfLines={2}>
                      Towards{' '}
                      {[p.to, p.to2]
                        .filter(Boolean)
                        .map((x) => stationByCode.get(x!)?.name ?? x)
                        .join(' / ')}
                      {/\(Airport Express\)/.test(p.name) ? ' (Airport Express)' : ''}
                    </T>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {gates.length ? (
          <>
            <SectionHeader
              title={`Gates · ${gates.length}`}
              action={gates.length > 4 ? (showAllGates ? 'Less' : 'All') : undefined}
              onAction={() => setShowAllGates((v) => !v)}
            />
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {(showAllGates ? gates : gates.slice(0, 4)).map((g, i) => (
                <View key={g.name + i}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 }}>
                    <Icon name="door.left.hand.open" size={16} color={g.open ? c.text2 : c.danger} />
                    <View style={{ flex: 1 }}>
                      <T v="bodyStrong">
                        {g.name}
                        {g.open ? '' : ' · Closed'}
                      </T>
                      {g.loc ? (
                        <T v="caption" dim numberOfLines={2}>
                          {g.loc}
                        </T>
                      ) : null}
                    </View>
                    {g.divyang ? <Icon name="figure.roll" size={14} color={c.success} /> : null}
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {d?.lifts?.length ? (
          <>
            <SectionHeader title="Lifts & escalators" action={showLifts ? 'Hide' : 'Show all'} onAction={() => setShowLifts((v) => !v)} />
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 20 }}>
                <Stat label="Lifts" value={lifts.length} sub={`${lifts.filter((l) => l.ok).length} working`} />
                <Stat label="Escalators" value={escalators.length} sub={`${escalators.filter((l) => l.ok).length} working`} />
              </View>
              {showLifts
                ? d.lifts.map((l, i) => (
                    <View key={l.name + i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <Icon
                        name={l.type === 'Lift' ? 'arrow.up.arrow.down.square' : 'stairs'}
                        size={14}
                        color={l.ok ? c.text2 : c.danger}
                        style={{ marginTop: 2 }}
                      />
                      <T v="caption" dim style={{ flex: 1 }}>
                        <T v="caption" style={{ fontFamily: 'Inter-SemiBold' }}>
                          {l.name}
                        </T>
                        {l.loc ? ` — ${l.loc}` : ''}
                        {l.side ? ` (${l.side.toLowerCase()})` : ''}
                        {l.ok ? '' : ' · Not working'}
                      </T>
                    </View>
                  ))
                : null}
            </Card>
          </>
        ) : null}

        {d?.facilities?.length ? (
          <>
            <SectionHeader title="Facilities" />
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {d.facilities.map((f, i) => (
                <View key={f.kind}>
                  {i > 0 ? <Divider inset={44} /> : null}
                  <Row
                    icon={FAC_ICON[f.kind] ?? 'info.circle.fill'}
                    title={`${f.kind}${f.items.length > 1 ? ` · ${f.items.length}` : ''}`}
                    subtitleLines={0}
                    subtitle={f.items.map((it) => [it.name !== f.kind ? it.name : '', it.loc].filter(Boolean).join(': ')).join('\n')}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {d?.parking?.length ? (
          <>
            <SectionHeader title="Parking" />
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {d.parking.map((p, i) => (
                <View key={i}>
                  {i > 0 ? <Divider inset={44} /> : null}
                  <Row
                    icon="parkingsign.circle.fill"
                    iconColor="#2A5BD7"
                    title={p.by || 'Parking'}
                    subtitle={[
                      p.loc,
                      [p.car ? `${p.car} cars` : '', p.bike ? `${p.bike} two-wheelers` : '', p.cycle ? `${p.cycle} cycles` : ''].filter(Boolean).join(' · '),
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {d?.feeder?.length ? (
          <>
            <SectionHeader title="Feeder buses" />
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {d.feeder.map((f, i) => (
                <View key={i}>
                  {i > 0 ? <Divider inset={44} /> : null}
                  <Row
                    icon="bus.fill"
                    iconColor="#1F9D55"
                    subtitleLines={0}
                    title={`${f.route_num ?? 'Route'} · ${f.destination ?? ''}`}
                    subtitle={[f.area_covered, f.service_frequency ? `Every ${f.service_frequency}` : '', f.fare].filter(Boolean).join('\n')}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {d?.nearby?.length ? <Nearby items={d.nearby} /> : null}

        {d?.mobile || d?.landline ? (
          <>
            <SectionHeader title="Contact station" />
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {d.mobile ? (
                <Row
                  icon="phone.fill"
                  iconColor="#1F9D55"
                  title={d.mobile}
                  subtitle="Station mobile"
                  onPress={() => Linking.openURL(`tel:${d.mobile}`)}
                  chevron
                />
              ) : null}
              {d.mobile && d.landline ? <Divider inset={44} /> : null}
              {d.landline ? (
                <Row
                  icon="phone"
                  iconColor="#1F9D55"
                  title={d.landline}
                  subtitle="Station landline"
                  onPress={() => Linking.openURL(`tel:${d.landline}`)}
                  chevron
                />
              ) : null}
            </Card>
          </>
        ) : null}

        {d?.desc ? (
          <>
            <SectionHeader title="About" />
            <Card>
              <T v="body" dim>
                {d.desc}
              </T>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <View>
      <T v="micro" faint>
        {label}
      </T>
      <T v="title">{value}</T>
      <T v="caption" dim>
        {sub}
      </T>
    </View>
  );
}

function Nearby({ items }: { items: NonNullable<ReturnType<typeof getDetails>>['nearby'] }) {
  const { c } = useTheme();
  const groups = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items) {
      const k = it.group === 'Emergency' ? 'Emergency' : it.cat;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return [...m.entries()];
  }, [items]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <SectionHeader title="Nearby places" />
      <Card pad={0} style={{ paddingHorizontal: 14 }}>
        {groups.map(([k, list], i) => (
          <View key={k}>
            {i > 0 ? <Divider /> : null}
            <Press onPress={() => setOpen(open === k ? null : k)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 }}>
              <T v="bodyStrong" style={{ flex: 1 }}>
                {k}
              </T>
              <T v="caption" dim>
                {list.length}
              </T>
              <Icon name={open === k ? 'chevron.up' : 'chevron.down'} size={11} color={c.text3} />
            </Press>
            {open === k
              ? list.map((it, j) => (
                  <View key={j} style={{ paddingBottom: 10, paddingLeft: 4 }}>
                    <T v="body">{it.name}</T>
                    <T v="caption" dim>
                      {[
                        it.group === 'Emergency' ? it.cat : '',
                        it.km != null ? `${it.km} km` : '',
                        it.walk ? `${Math.round(it.walk)} min walk` : '',
                        it.gate ? `via ${it.gate}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </T>
                  </View>
                ))
              : null}
          </View>
        ))}
      </Card>
    </>
  );
}
