import { router } from 'expo-router';
import { memo, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Divider, Icon, LineDots, Press, T } from '@/components/ui';
import { fmtKm, walkMin } from '@/lib/format';
import { EDGES, getStation, haversineKm, LINES, lineById, lineLabel, STATIONS, stationColors, type Station } from '@/lib/network';
import { locate, useNearest } from '@/lib/useLocation';
import { usePlanner } from '@/store/planner';
import { radius, useTheme } from '@/theme';

const DELHI: Region = { latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.38, longitudeDelta: 0.38 };

const Lines = memo(function Lines({ hidden }: { hidden: Set<string> }) {
  return (
    <>
      {EDGES.filter((e) => !hidden.has(e.line)).map((e) => {
        const a = getStation(e.a);
        const b = getStation(e.b);
        return (
          <Polyline
            key={`${e.line}-${e.a}-${e.b}`}
            coordinates={[
              { latitude: a.lat, longitude: a.lng },
              { latitude: b.lat, longitude: b.lng },
            ]}
            strokeColor={lineById.get(e.line)!.color}
            strokeWidth={4}
            lineCap="round"
          />
        );
      })}
    </>
  );
});

const Stations = memo(function Stations({ onSelect, hidden }: { onSelect: (s: Station) => void; hidden: Set<string> }) {
  return (
    <>
      {STATIONS.filter((s) => s.lines.some((l) => !hidden.has(l))).map((s) => (
        <Marker
          key={s.code}
          coordinate={{ latitude: s.lat, longitude: s.lng }}
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 0.5 }}
          onPress={() => onSelect(s)}>
          <View
            style={{
              width: s.interchange ? 12 : 9,
              height: s.interchange ? 12 : 9,
              borderRadius: 6,
              backgroundColor: '#FFFFFF',
              borderWidth: s.interchange ? 2.5 : 2,
              borderColor: s.interchange ? '#111111' : lineById.get(s.lines[0])!.color,
            }}
          />
        </Marker>
      ))}
    </>
  );
});

export default function MapScreen() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [sel, setSel] = useState<Station | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const { list: nearby, coords } = useNearest(1, false);
  const nearest = nearby[0] && nearby[0].km < 40 ? nearby[0] : null;
  const legend = useMemo(
    () => LINES.filter((l, i, arr) => arr.findIndex((x) => x.color === l.color && lineLabel(x).split(' ')[0] === lineLabel(l).split(' ')[0]) === i),
    [],
  );

  const select = (s: Station) => {
    setSel(s);
    mapRef.current?.animateToRegion({ latitude: s.lat - 0.004, longitude: s.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 300);
  };

  const toggleLine = (id: string) => {
    const l = lineById.get(id)!;
    const group = LINES.filter((x) => x.color === l.color).map((x) => x.id);
    setHidden((h) => {
      const n = new Set(h);
      const isHidden = group.every((g) => n.has(g));
      group.forEach((g) => (isHidden ? n.delete(g) : n.add(g)));
      return n;
    });
  };

  const selKm = sel && coords ? fmtKm(haversineKm(coords.lat, coords.lng, sel.lat, sel.lng)) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={DELHI}
        showsUserLocation
        showsCompass={false}
        showsPointsOfInterests={false}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        onPress={(e) => {
          if (e.nativeEvent.action !== 'marker-press') setSel(null);
        }}>
        <Lines hidden={hidden} />
        <Stations onSelect={select} hidden={hidden} />
      </MapView>

      {showFilter ? (
        <Card style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T v="h3" style={{ flex: 1 }}>Visible lines</T>
            {hidden.size ? <Press onPress={() => setHidden(new Set())} hitSlop={8}><T v="label" color={c.accent}>Show all</T></Press> : null}
            <Press onPress={() => setShowFilter(false)} hitSlop={8} accessibilityLabel="Close filters"><Icon name="xmark" size={14} color={c.text2} /></Press>
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {legend.map((l) => {
              const off = hidden.has(l.id);
              return (
                <Press key={l.id} onPress={() => toggleLine(l.id)} accessibilityState={{ selected: !off }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill, backgroundColor: off ? c.bg : c.surface2 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: off ? c.border : l.color }} />
                  <T v="label" color={off ? c.text3 : c.text}>{lineLabel(l).replace(' Line', '')}</T>
                  {!off ? <Icon name="checkmark" size={9} color={c.text2} /> : null}
                </Press>
              );
            })}
          </View>
        </Card>
      ) : null}

      <View style={{ position: 'absolute', right: 12, bottom: insets.bottom + 100 + (sel ? 120 : nearest ? 64 : 0), gap: 8 }}>
        <Press
          accessibilityLabel="Centre on my location"
          onPress={async () => {
            const p = await locate(true);
            if (p) mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 300);
          }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 0.5,
            borderColor: c.border,
          }}>
          <Icon name="location.fill" size={17} color={c.accent} />
        </Press>
        <Press
          onPress={() => setShowFilter((v) => !v)}
          accessibilityLabel="Filter lines"
          accessibilityState={{ expanded: showFilter }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 0.5,
            borderColor: c.border,
          }}>
          <Icon
            name={hidden.size ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease'}
            size={17}
            color={hidden.size || showFilter ? c.accent : c.text}
          />
        </Press>
        <Press onPress={() => { setSel(null); mapRef.current?.animateToRegion(DELHI, 300); }} accessibilityLabel="Show full network"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: c.border }}>
          <Icon name="arrow.up.left.and.arrow.down.right" size={16} />
        </Press>
      </View>

      <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 90 }}>
        {sel ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Press
                onPress={() => router.push({ pathname: '/station/[code]', params: { code: sel.code } })}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <LineDots colors={stationColors(sel)} size={8} />
                <T v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {sel.name}
                </T>
                <Icon name="chevron.right" size={11} color={c.text3} />
              </Press>
              {selKm ? (
                <T v="label" faint>
                  {selKm}
                </T>
              ) : null}
              <Press onPress={() => setSel(null)} hitSlop={10} accessibilityLabel="Close">
                <Icon name="xmark.circle.fill" size={20} color={c.text3} />
              </Press>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Press
                onPress={() => {
                  usePlanner.getState().set({ from: sel.code, fromIsLocation: false });
                  router.navigate('/');
                }}
                style={{ flex: 1, height: 40, borderRadius: radius.md, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <T v="label">From here</T>
              </Press>
              <Press
                onPress={() => {
                  const p = usePlanner.getState();
                  p.set({ to: sel.code });
                  if (p.from && p.from !== sel.code) router.push({ pathname: '/journey', params: { from: p.from, to: sel.code } });
                  else router.navigate('/');
                }}
                style={{ flex: 1, height: 40, borderRadius: radius.md, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                <T v="label" color={c.onInk}>
                  Go here
                </T>
              </Press>
            </View>
          </Card>
        ) : nearest ? (
          <Press onPress={() => select(nearest.station)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="figure.walk" size={16} color={c.text2} />
              <T v="body" numberOfLines={1} style={{ flex: 1 }}>
                {nearest.station.name}
              </T>
              <T v="label" faint>
                {walkMin(nearest.km)} min walk
              </T>
            </Card>
          </Press>
        ) : null}
      </View>
    </View>
  );
}
