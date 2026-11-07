import { memo, type Ref } from 'react';
import { Text as RNText, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { MAP_EDGES } from '@/lib/mapGeometry';
import { getStation, lineById, STATIONS, type Station } from '@/lib/network';

import type { MetroMapHandle, MetroMapProps } from './metro-map.types';

export * from './metro-map.types';

const Lines = memo(function Lines({ hidden }: { hidden: Set<string> }) {
  return (
    <>
      {MAP_EDGES.filter((e) => !hidden.has(e.line)).map((e) => (
        <Polyline
          key={e.key}
          coordinates={e.coordinates}
          strokeColor={lineById.get(e.line)!.color}
          strokeWidth={4}
          lineCap="round"
        />
      ))}
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
          centerOffset={{ x: 0, y: 0 }}
          zIndex={2}
          onPress={() => onSelect(s)}>
          {/* Preserve the 16pt native frame: flattening this wrapper offsets the
              inner dot relative to MapKit's annotation coordinate. */}
          <View collapsable={false} style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: s.interchange ? 12 : 9, height: s.interchange ? 12 : 9, borderRadius: 6,
              backgroundColor: '#FFFFFF', borderWidth: s.interchange ? 2.5 : 2,
              borderColor: s.interchange ? '#111111' : lineById.get(s.lines[0])!.color }} />
          </View>
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

/** iOS: MapKit through react-native-maps. */
export function MetroMap({ ref, initialRegion, dark, hidden, labeled, onSelect, onRegionChangeComplete, onPressMap }: MetroMapProps & { ref?: Ref<MetroMapHandle> }) {
  return (
    <MapView
      ref={ref as Ref<MapView>}
      style={{ flex: 1 }}
      initialRegion={initialRegion}
      showsUserLocation
      showsCompass={false}
      showsPointsOfInterests={false}
      userInterfaceStyle={dark ? 'dark' : 'light'}
      onRegionChangeComplete={onRegionChangeComplete}
      onPress={(e) => {
        if (e.nativeEvent.action !== 'marker-press') onPressMap();
      }}>
      <Lines hidden={hidden} />
      <Stations onSelect={onSelect} hidden={hidden} />
      <Labels codes={labeled} dark={dark} />
    </MapView>
  );
}
