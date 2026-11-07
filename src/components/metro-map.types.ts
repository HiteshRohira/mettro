import type { Station } from '@/lib/network';

/** Same shape as react-native-maps' Region, so the screen is map-library agnostic. */
export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type LatLng = { latitude: number; longitude: number };

export type MetroMapHandle = {
  animateToRegion(region: Region, duration?: number): void;
  fitToCoordinates(coords: LatLng[], options: { edgePadding: { top: number; right: number; bottom: number; left: number }; animated?: boolean }): void;
};

export type MetroMapProps = {
  initialRegion: Region;
  dark: boolean;
  /** Line ids to leave out. */
  hidden: Set<string>;
  /** Station codes whose names should be drawn. */
  labeled: Set<string>;
  onSelect: (s: Station) => void;
  onRegionChangeComplete: (r: Region) => void;
  /** A tap on the map that didn't hit a station. */
  onPressMap: () => void;
};
