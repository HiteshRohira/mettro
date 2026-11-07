import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Disclosure, Divider, Icon, LineChip, Press, SectionHeader, T } from '@/components/ui';
import { fetchStationLive, type StationLive } from '@/lib/api';
import { getDetails } from '@/lib/details';
import { hm } from '@/lib/format';
import { directionsAt, getLine, lineLabel, linesOf, stationByCode, titleTowards } from '@/lib/network';
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
  const favourites = useSettings((st) => st.favourites);
  const lineStatus = useStatus((st) => st.lines);
  const [live, setLive] = useState<StationLive | null>(null);

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
  const brokenLifts = d?.lifts.filter((l) => !l.ok) ?? [];
  const call = (n: string) => Linking.openURL(`tel:${n}`);

  type Section = { title: string; detail?: string; tone?: 'danger'; body: React.ReactNode };
  const sections: Section[] = [];
  if (d?.platforms?.length)
    sections.push({
      title: 'Platforms',
      detail: String(d.platforms.length),
      body: d.platforms.map((p) => (
        <Item
          key={p.name}
          title={p.name.replace(/\s*\(.*\)/, '')}
          sub={`Towards ${[p.to, p.to2]
            .filter(Boolean)
            .map((x) => stationByCode.get(x!)?.name ?? x)
            .join(' / ')}${/\(Airport Express\)/.test(p.name) ? ' (Airport Express)' : ''}`}
        />
      )),
    });
  if (gates.length)
    sections.push({
      title: 'Gates',
      detail: closedGates.length ? `${closedGates.length} closed` : String(gates.length),
      tone: closedGates.length ? 'danger' : undefined,
      body: gates.map((g, i) => <Item key={g.name + i} title={`${g.name}${g.open ? '' : ' · Closed'}`} sub={g.loc} bad={!g.open} />),
    });
  if (d?.lifts?.length)
    sections.push({
      title: 'Lifts & escalators',
      detail: brokenLifts.length ? `${brokenLifts.length} not working` : `${lifts.length} · ${escalators.length}`,
      tone: brokenLifts.length ? 'danger' : undefined,
      body: d.lifts.map((l, i) => (
        <Item
          key={l.name + i}
          icon={l.type === 'Lift' ? 'arrow.up.arrow.down.square' : 'stairs'}
          bad={!l.ok}
          title={`${l.name}${l.ok ? '' : ' · Not working'}`}
          sub={[l.loc, l.side?.toLowerCase()].filter(Boolean).join(' · ')}
        />
      )),
    });
  if (d?.facilities?.length)
    sections.push({
      title: 'Facilities',
      detail: String(d.facilities.length),
      body: d.facilities.map((f) => (
        <Item
          key={f.kind}
          icon={FAC_ICON[f.kind] ?? 'info.circle'}
          title={f.kind}
          sub={f.items.map((it) => [it.name !== f.kind ? it.name : '', it.loc].filter(Boolean).join(': ')).filter(Boolean).join('\n')}
        />
      )),
    });
  if (d?.parking?.length)
    sections.push({
      title: 'Parking',
      body: d.parking.map((p, i) => (
        <Item
          key={i}
          title={p.by || 'Parking'}
          sub={[p.loc, [p.car ? `${p.car} cars` : '', p.bike ? `${p.bike} two-wheelers` : '', p.cycle ? `${p.cycle} cycles` : ''].filter(Boolean).join(' · ')]
            .filter(Boolean)
            .join('\n')}
        />
      )),
    });
  if (d?.feeder?.length)
    sections.push({
      title: 'Feeder buses',
      detail: String(d.feeder.length),
      body: d.feeder.map((f, i) => (
        <Item
          key={i}
          title={`${f.route_num ?? 'Route'} · ${f.destination ?? ''}`}
          sub={[f.area_covered, f.service_frequency ? `Every ${f.service_frequency}` : '', f.fare].filter(Boolean).join('\n')}
        />
      )),
    });
  if (d?.nearby?.length) sections.push({ title: 'Nearby places', body: <Nearby items={d.nearby} /> });
  if (d?.mobile || d?.landline)
    sections.push({
      title: 'Contact',
      body: [d.mobile, d.landline]
        .filter(Boolean)
        .map((n) => <Item key={n} icon="phone" title={n!} onPress={() => call(n!)} />),
    });
  if (d?.desc)
    sections.push({
      title: 'About',
      body: (
        <T v="body" dim>
          {d.desc}
        </T>
      ),
    });

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
        <T v="display" style={{ marginTop: 4 }}>
          {s.name}
        </T>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {lines.map((l) => (
            <Press key={l.id} onPress={() => router.push({ pathname: '/line/[id]', params: { id: l.id } })}>
              <LineChip line={l} label={lineLabel(l)} />
            </Press>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <Button
            title="Route from"
            kind="secondary"
            style={{ flex: 1 }}
            onPress={() => {
              usePlanner.getState().set({ from: code, fromIsLocation: false });
              router.dismissTo('/');
            }}
          />
          <Button
            title="Route here"
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

        <SectionHeader title="Trains" />
        <Card pad={0} style={{ paddingHorizontal: 14 }}>
          {dirs.length ? (
            <>
              <View style={{ flexDirection: 'row', paddingTop: 12, paddingBottom: 2 }}>
                <View style={{ flex: 1 }} />
                <T v="micro" faint style={{ width: 54, textAlign: 'right' }}>
                  First
                </T>
                <T v="micro" faint style={{ width: 54, textAlign: 'right' }}>
                  Last
                </T>
              </View>
              {dirs.map((dir, i) => {
                const l = getLine(dir.line);
                return (
                  <View key={dir.neighbour}>
                    {i > 0 ? <Divider inset={18} /> : null}
                    <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.color }} />
                      <View style={{ flex: 1 }}>
                        <T v="body" numberOfLines={1}>
                          {titleTowards(dir.timing.to)}
                        </T>
                        {dir.timing.platform ? (
                          <T v="caption" faint numberOfLines={1}>
                            {dir.timing.platform}
                          </T>
                        ) : null}
                      </View>
                      <T v="mono" dim style={{ width: 54, textAlign: 'right' }}>
                        {hm(dir.timing.first)}
                      </T>
                      <T v="mono" style={{ width: 54, textAlign: 'right' }}>
                        {hm(dir.timing.last)}
                      </T>
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            <View style={{ paddingVertical: 14 }}>
              <T v="body" dim>
                Open {s.open || '—'} – {s.close || '—'}
              </T>
            </View>
          )}
        </Card>

        {sections.length ? (
          <>
            <SectionHeader title="Station" />
            <Card pad={0} style={{ paddingHorizontal: 14 }}>
              {sections.map((sec, i) => (
                <Disclosure key={sec.title} first={i === 0} title={sec.title} detail={sec.detail} tone={sec.tone}>
                  {sec.body}
                </Disclosure>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Item({ title, sub, icon, bad, onPress }: { title: string; sub?: string; icon?: any; bad?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      {icon ? <Icon name={icon} size={14} color={bad ? c.danger : c.text3} style={{ marginTop: 3 }} /> : null}
      <View style={{ flex: 1 }}>
        <T v="label" color={bad ? c.danger : onPress ? c.accent : c.text}>
          {title}
        </T>
        {sub ? (
          <T v="caption" dim>
            {sub}
          </T>
        ) : null}
      </View>
    </View>
  );
  return onPress ? <Press onPress={onPress}>{body}</Press> : body;
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
    <View>
        {groups.map(([k, list]) => (
          <View key={k}>
            <Press onPress={() => setOpen(open === k ? null : k)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 }}>
              <T v="label" style={{ flex: 1 }}>
                {k}
              </T>
              <T v="caption" dim>
                {list.length}
              </T>
              <Icon name={open === k ? 'chevron.up' : 'chevron.down'} size={11} color={c.text3} />
            </Press>
            {open === k
              ? list.map((it, j) => (
                  <View key={j} style={{ paddingBottom: 8, paddingLeft: 12 }}>
                    <T v="caption">{it.name}</T>
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
    </View>
  );
}
