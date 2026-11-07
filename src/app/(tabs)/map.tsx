import { router } from 'expo-router';
import { memo, useMemo, useRef, useState } from 'react';
import { Text as RNText, View } from 'react-native';
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
          zIndex={2}
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

// Names are separate, non-interactive markers under the dots. The view is square and
// centred on the station because iOS sizes custom annotation frames square: a wide,
// short view would be drawn off-centre and drag the dot off its line.
const LABEL_BOX = 132;
const Labels = memo(function Labels({ codes, dark }: { codes: Set<string>; dark: boolean }) {
  return (
    <>
      {[...codes].map((code) => {
        const s = getStation(code);
        return (
          <Marker
            key={code}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            tappable={false}
            zIndex={1}>
            <View pointerEvents="none" style={{ width: LABEL_BOX, height: LABEL_BOX, alignItems: 'center' }}>
              <RNText
                numberOfLines={1}
                style={{
                  marginTop: LABEL_BOX / 2 + 8,
                  maxWidth: LABEL_BOX,
                  fontFamily: 'Inter-SemiBold',
                  fontSize: 11,
                  color: dark ? '#F3F4F6' : '#0E1116',
                  textShadowColor: dark ? '#0A0C10' : '#FFFFFF',
                  textShadowRadius: 3,
                  textShadowOffset: { width: 0, height: 0 },
                }}>
                {s.name}
              </RNText>
            </View>
          </Marker>
        );
      })}
    </>
  );
});

export default function MapScreen() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [sel, setSel] = useState<Station | null>(null);
  // Lines the user picked. Empty = the whole network.
  const [only, setOnly] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const [region, setRegion] = useState<Region>(DELHI);
  const [panelH, setPanelH] = useState(0);
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

  const groupOf = (id: string) => {
    const l = lineById.get(id)!;
    return LINES.filter((x) => x.color === l.color).map((x) => x.id);
  };
  const hidden = useMemo(() => {
    if (!only.length) return new Set<string>();
    const shown = new Set(only.flatMap(groupOf));
    return new Set(LINES.filter((l) => !shown.has(l.id)).map((l) => l.id));
  }, [only]);

  // Names only where they're readable: every on-screen station once zoomed in,
  // plus the terminals of picked lines at any zoom (where does this line go?).
  const labeled = useMemo(() => {
    const out = new Set<string>();
    if (only.length) {
      for (const id of only.flatMap(groupOf)) {
        const l = lineById.get(id)!;
        [l.stations[0], l.stations[l.stations.length - 1], ...l.branches.map((b) => b[b.length - 1])].forEach((code) => out.add(code));
      }
    }
    if (region.latitudeDelta < 0.09) {
      const { latitude: la, longitude: lo, latitudeDelta: dla, longitudeDelta: dlo } = region;
      for (const st of STATIONS) {
        if (Math.abs(st.lat - la) < dla / 2 && Math.abs(st.lng - lo) < dlo / 2 && st.lines.some((l) => !hidden.has(l))) out.add(st.code);
      }
    }
    return out;
  }, [only, region, hidden]);

  // Frame the chosen lines so their ends are on screen.
  const frame = (ids: string[]) => {
    if (!ids.length) return mapRef.current?.animateToRegion(DELHI, 300);
    const codes = new Set(ids.flatMap(groupOf).flatMap((id) => STATIONS.filter((st) => st.lines.includes(id)).map((st) => st.code)));
    const coords = [...codes].map((code) => ({ latitude: getStation(code).lat, longitude: getStation(code).lng }));
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: insets.top + 60, right: 70, bottom: insets.bottom + 110 + panelH, left: 50 },
      animated: true,
    });
  };

  const pickLine = (id: string) => {
    const next = only.includes(id) ? only.filter((x) => x !== id) : [...only, id];
    setOnly(next);
    setSel(null);
    frame(next);
  };
  const showAll = () => {
    setOnly([]);
    frame([]);
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
        onRegionChangeComplete={setRegion}
        onPress={(e) => {
          if (e.nativeEvent.action !== 'marker-press') setSel(null);
        }}>
        <Lines hidden={hidden} />
        <Stations onSelect={select} hidden={hidden} />
        <Labels codes={labeled} dark={dark} />
      </MapView>

      {showFilter ? (
        <Card onLayout={(e) => setPanelH(e.nativeEvent.layout.height)} style={{ position: 'absolute', bottom: insets.bottom + 90, left: 12, right: 12, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T v="h3" style={{ flex: 1 }}>
              Show lines
            </T>
            <Press onPress={() => setShowFilter(false)} hitSlop={10} accessibilityLabel="Close">
              <Icon name="xmark" size={14} color={c.text2} />
            </Press>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <FilterChip label="All lines" on={!only.length} onPress={showAll} />
            {legend.map((l) => (
              <FilterChip key={l.id} label={lineLabel(l).replace(' Line', '')} color={l.color} on={only.includes(l.id)} onPress={() => pickLine(l.id)} />
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ position: 'absolute', right: 12, bottom: insets.bottom + 100 + (showFilter ? panelH : sel ? 120 : nearest ? 64 : 0), gap: 8 }}>
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
            name={only.length ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease'}
            size={17}
            color={only.length || showFilter ? c.accent : c.text}
          />
        </Press>
        <Press onPress={() => { setSel(null); frame(only); }} accessibilityLabel={only.length ? 'Fit selected lines' : 'Show full network'}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: c.border }}>
          <Icon name="arrow.up.left.and.arrow.down.right" size={16} />
        </Press>
      </View>

      <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 90 }}>
        {showFilter ? null : sel ? (
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
                {walkMin(nearest.km)} min
              </T>
            </Card>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

function FilterChip({ label, color, on, onPress }: { label: string; color?: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 12,
        minHeight: 36,
        borderRadius: radius.pill,
        backgroundColor: on ? c.ink : c.surface2,
      }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <T v="label" color={on ? c.onInk : c.text}>
        {label}
      </T>
    </Press>
  );
}
