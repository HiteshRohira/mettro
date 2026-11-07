import { Camera, GeoJSONSource, Layer, Map, NativeUserLocation, type CameraRef } from '@maplibre/maplibre-react-native';
import { useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Dimensions, View } from 'react-native';

import { MAP_EDGES } from '@/lib/mapGeometry';
import { getStation, lineById, STATIONS } from '@/lib/network';

import type { MetroMapHandle, MetroMapProps, Region } from './metro-map.types';

export * from './metro-map.types';

/**
 * Android: MapLibre with OpenFreeMap vector styles (OpenStreetMap data, no API key).
 * Same lines, station dots and labels as the iOS MapKit map.
 */
const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const LABEL_FONT = ['Noto Sans Bold'];
const TILE = 512;

/** MapKit-style region → MapLibre zoom for a view of w×h points. */
function zoomFor(r: Region, w: number, h: number) {
  const zLng = Math.log2((360 * w) / (TILE * r.longitudeDelta));
  const zLat = Math.log2((360 * h * Math.cos((r.latitude * Math.PI) / 180)) / (TILE * r.latitudeDelta));
  return Math.min(zLng, zLat);
}

export function MetroMap({ ref, initialRegion, dark, hidden, labeled, onSelect, onRegionChangeComplete, onPressMap }: MetroMapProps & { ref?: Ref<MetroMapHandle> }) {
  const camera = useRef<CameraRef>(null);
  const [size, setSize] = useState(() => ({ w: Dimensions.get('window').width, h: Dimensions.get('window').height }));
  const [initialZoom] = useState(() => zoomFor(initialRegion, size.w, size.h));

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion(r, duration = 300) {
        camera.current?.easeTo({ center: [r.longitude, r.latitude], zoom: zoomFor(r, size.w, size.h), duration });
      },
      fitToCoordinates(coords, { edgePadding, animated = true }) {
        if (!coords.length) return;
        const lngs = coords.map((p) => p.longitude);
        const lats = coords.map((p) => p.latitude);
        camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
          padding: edgePadding,
          duration: animated ? 400 : 0,
        });
      },
    }),
    [size],
  );

  const lines = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: MAP_EDGES.filter((e) => !hidden.has(e.line)).map((e) => ({
        type: 'Feature',
        properties: { color: lineById.get(e.line)!.color },
        geometry: { type: 'LineString', coordinates: e.coordinates.map((p) => [p.longitude, p.latitude]) },
      })),
    }),
    [hidden],
  );

  const stations = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: STATIONS.filter((s) => s.lines.some((l) => !hidden.has(l))).map((s) => ({
        type: 'Feature',
        properties: { code: s.code, interchange: s.interchange ? 1 : 0, color: s.interchange ? '#111111' : lineById.get(s.lines[0])!.color },
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      })),
    }),
    [hidden],
  );

  const labels = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [...labeled].map((code) => {
        const s = getStation(code);
        return { type: 'Feature', properties: { name: s.name }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } };
      }),
    }),
    [labeled],
  );

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Map
        style={{ flex: 1 }}
        mapStyle={dark ? STYLE.dark : STYLE.light}
        attribution={false}
        logo={false}
        compass={false}
        touchPitch={false}
        onPress={() => onPressMap()}
        onRegionDidChange={(e) => {
          const [west, south, east, north] = e.nativeEvent.bounds;
          onRegionChangeComplete({
            latitude: (south + north) / 2,
            longitude: (west + east) / 2,
            latitudeDelta: north - south,
            longitudeDelta: east - west,
          });
        }}>
        <Camera
          ref={camera}
          initialViewState={{ center: [initialRegion.longitude, initialRegion.latitude], zoom: initialZoom }}
        />
        <NativeUserLocation />

        <GeoJSONSource id="metro-lines" data={lines}>
          <Layer
            type="line"
            id="metro-lines"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': ['get', 'color'], 'line-width': 4 }}
          />
        </GeoJSONSource>

        <GeoJSONSource
          id="metro-stations"
          data={stations}
          onPress={(e) => {
            e.stopPropagation();
            const code = e.nativeEvent.features[0]?.properties?.code;
            if (typeof code === 'string') onSelect(getStation(code));
          }}>
          {/* invisible, finger-sized hit target */}
          <Layer type="circle" id="metro-stations-hit" paint={{ 'circle-radius': 14, 'circle-opacity': 0 }} />
          <Layer
            type="circle"
            id="metro-stations"
            paint={{
              // stroke is drawn outside the radius: totals match the iOS 12pt / 9pt dots
              'circle-radius': ['case', ['==', ['get', 'interchange'], 1], 3.5, 2.5],
              'circle-color': '#FFFFFF',
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-width': ['case', ['==', ['get', 'interchange'], 1], 2.5, 2],
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="metro-labels" data={labels}>
          <Layer
            type="symbol"
            id="metro-labels"
            layout={{
              'text-field': ['get', 'name'],
              'text-font': LABEL_FONT,
              'text-size': 11,
              'text-anchor': 'top',
              'text-offset': [0, 0.8],
              'text-max-width': 10,
            }}
            paint={{
              'text-color': dark ? '#F3F4F6' : '#0E1116',
              'text-halo-color': dark ? '#0A0C10' : '#FFFFFF',
              'text-halo-width': 1.5,
            }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
}
