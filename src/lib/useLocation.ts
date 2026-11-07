import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';

import { nearestStations, type Station } from '@/lib/network';

type LocState = {
  coords: { lat: number; lng: number; acc: number } | null;
  status: 'idle' | 'loading' | 'granted' | 'denied' | 'error';
  at: number | null;
  set: (p: Partial<LocState>) => void;
};

export const useLoc = create<LocState>()((set) => ({ coords: null, status: 'idle', at: null, set: (p) => set(p) }));

export async function locate(ask = true) {
  const st = useLoc.getState();
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      console.warn('location permission', perm.status);
      st.set({ status: 'denied' });
      return null;
    }
    st.set({ status: st.coords ? 'granted' : 'loading' });
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60e3 }).catch(() => null);
    if (last)
      st.set({ coords: { lat: last.coords.latitude, lng: last.coords.longitude, acc: last.coords.accuracy ?? 999 }, status: 'granted', at: Date.now() });
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy ?? 999 };
    st.set({ coords, status: 'granted', at: Date.now() });
    return coords;
  } catch (e) {
    console.warn('locate failed', e);
    st.set({ status: useLoc.getState().coords ? 'granted' : 'error' });
    return useLoc.getState().coords;
  }
}

export function useNearest(n = 3, autoAsk = false) {
  const { coords, status } = useLoc();
  const list = useMemo<{ station: Station; km: number }[]>(() => (coords ? nearestStations(coords.lat, coords.lng, n) : []), [coords, n]);
  useEffect(() => {
    locate(autoAsk);
  }, [autoAsk]);
  const refresh = useCallback(() => locate(true), []);
  return { list, coords, status, refresh };
}
