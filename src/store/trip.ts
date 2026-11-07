import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Journey } from '@/lib/router';

export type Fix = { lat: number; lng: number; acc: number; at: number };

export type Trip = {
  journey: Journey;
  startedAt: number; // planned departure (epoch ms) of first train
  delayMs: number; // learned offset from GPS
  idx: number; // index into timeline of last passed station
  lastFix: Fix | null;
  gpsIdxAt: number | null; // when GPS last confirmed a station
  activityId: string | null;
  ended: boolean;
};

type TripState = {
  trip: Trip | null;
  setTrip: (t: Trip | null) => void;
  patch: (p: Partial<Trip>) => void;
};

export const useTrip = create<TripState>()(
  persist(
    (set, get) => ({
      trip: null,
      setTrip: (trip) => set({ trip }),
      patch: (p) => {
        const t = get().trip;
        if (t) set({ trip: { ...t, ...p } });
      },
    }),
    { name: 'mettro-trip', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
