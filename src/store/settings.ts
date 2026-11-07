import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Appearance = 'system' | 'light' | 'dark';

type Recent = { from: string; to: string; at: number };

type SettingsState = {
  appearance: Appearance;
  liveActivities: boolean;
  home: string | null;
  work: string | null;
  favourites: string[];
  recents: Recent[];
  onboarded: boolean;
  set: (p: Partial<Omit<SettingsState, 'set' | 'toggleFav' | 'addRecent'>>) => void;
  toggleFav: (code: string) => void;
  addRecent: (from: string, to: string) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      appearance: 'system',
      liveActivities: true,
      home: null,
      work: null,
      favourites: [],
      recents: [],
      onboarded: false,
      set: (p) => set(p),
      toggleFav: (code) => {
        const f = get().favourites;
        set({ favourites: f.includes(code) ? f.filter((c) => c !== code) : [code, ...f] });
      },
      addRecent: (from, to) => {
        const r = get().recents.filter((x) => !(x.from === from && x.to === to));
        set({ recents: [{ from, to, at: Date.now() }, ...r].slice(0, 8) });
      },
    }),
    { name: 'mettro-settings', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
