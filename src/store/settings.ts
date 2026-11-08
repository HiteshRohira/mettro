import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { pairId, type SavedTrip } from '@/lib/savedTrips';

export type Appearance = 'system' | 'light' | 'dark';

type SettingsState = {
  appearance: Appearance;
  liveActivities: boolean;
  favourites: string[];
  trips: SavedTrip[];
  onboarded: boolean;
  set: (p: Partial<Pick<SettingsState, 'appearance' | 'liveActivities' | 'favourites' | 'onboarded'>>) => void;
  toggleFav: (code: string) => void;
  /** Saves the pair; returns false if a trip between these stations already exists. */
  saveTrip: (from: string, to: string, title?: string | null) => boolean;
  renameTrip: (id: string, title: string) => void;
  deleteTrip: (id: string) => void;
  /** Records a trip taken between a saved pair (recency and last direction). */
  touchTrip: (from: string, to: string) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      appearance: 'system',
      liveActivities: true,
      favourites: [],
      trips: [],
      onboarded: false,
      set: (p) => set(p),
      toggleFav: (code) => {
        const f = get().favourites;
        set({ favourites: f.includes(code) ? f.filter((c) => c !== code) : [code, ...f] });
      },
      saveTrip: (from, to, title = null) => {
        const id = pairId(from, to);
        if (from === to || get().trips.some((t) => t.id === id)) return false;
        set({ trips: [{ id, a: from, b: to, title: title?.trim() || null, lastFrom: from, usedAt: Date.now() }, ...get().trips] });
        return true;
      },
      renameTrip: (id, title) => set({ trips: get().trips.map((t) => (t.id === id ? { ...t, title: title.trim() || null } : t)) }),
      deleteTrip: (id) => set({ trips: get().trips.filter((t) => t.id !== id) }),
      touchTrip: (from, to) => {
        const id = pairId(from, to);
        if (!get().trips.some((t) => t.id === id)) return;
        set({ trips: get().trips.map((t) => (t.id === id ? { ...t, lastFrom: from, usedAt: Date.now() } : t)) });
      },
    }),
    {
      name: 'mettro-settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // v2: saved trips replace Home/Work and recents (old values are dropped).
      migrate: (old) => {
        const s = { ...(old as Record<string, unknown>) };
        delete s.home;
        delete s.work;
        delete s.recents;
        return { ...s, trips: [] } as unknown as SettingsState;
      },
    },
  ),
);

export const findTrip = (from: string, to: string) => useSettings.getState().trips.find((t) => t.id === pairId(from, to));
