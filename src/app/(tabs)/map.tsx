import { router } from 'expo-router';
import { memo, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Icon, LineDots, Press, T } from '@/components/ui';
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

      <View style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0, paddingHorizontal: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
          {legend.map((l) => {
            const off = hidden.has(l.id);
            return (
              <Press
                key={l.id}
                onPress={() => toggleLine(l.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 11,
                  height: 32,
                  borderRadius: radius.pill,
                  backgroundColor: c.surface,
                  opacity: off ? 0.45 : 1,
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.color }} />
                <T v="caption" style={{ fontFamily: 'Inter-Medium' }}>
                  {lineLabel(l).replace(' Line', '')}
                </T>
              </Press>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ position: 'absolute', right: 12, bottom: insets.bottom + 100 + (sel ? 150 : nearest ? 80 : 0), gap: 8 }}>
        <Press
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
          onPress={() => mapRef.current?.animateToRegion(DELHI, 300)}
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
          <Icon name="arrow.up.left.and.arrow.down.right" size={16} color={c.text} />
        </Press>
      </View>

      <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 90 }}>
        {sel ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LineDots colors={stationColors(sel)} />
              <T v="h3" style={{ flex: 1 }} numberOfLines={1}>
                {sel.name}
              </T>
              <Press onPress={() => setSel(null)} hitSlop={10}>
                <Icon name="xmark.circle.fill" size={20} color={c.text3} />
              </Press>
            </View>
            <T v="caption" dim>
              {sel.type}
              {sel.interchange ? ' · Interchange' : ''}
              {selKm ? ` · ${selKm} from you` : ''}
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Press
                onPress={() => router.push({ pathname: '/station/[code]', params: { code: sel.code } })}
                style={{ flex: 1, height: 40, borderRadius: radius.md, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <T v="label">Details</T>
              </Press>
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
              <Icon name="figure.walk" size={18} color={c.accent} />
              <View style={{ flex: 1 }}>
                <T v="micro" faint>
                  Nearest station
                </T>
                <T v="bodyStrong" numberOfLines={1}>
                  {nearest.station.name}
                </T>
              </View>
              <T v="label" dim>
                {walkMin(nearest.km)} min · {fmtKm(nearest.km)}
              </T>
            </Card>
          </Press>
        ) : null}
      </View>
    </View>
  );
}
