import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { stationByCode } from '@/lib/network';
import type { Journey } from '@/lib/router';

export type Fix = { lat: number; lng: number; acc: number; at: number };

export type Trip = {
  journey: Journey;
  /** Planned departure (epoch ms) of the first train. May be in the future (waiting for service). */
  startedAt: number;
  /** Learned offset from the timetable (ms, + = running late). */
  delayMs: number;
  /** Last station index confirmed by GPS or by the user ("I'm here"). Never inferred from the clock. */
  anchorIdx: number;
  /** When the anchor was last confirmed (epoch ms), or null if only the trip start is known. */
  anchorAt: number | null;
  lastFix: Fix | null;
  activityId: string | null;
  /** The user swiped the Live Activity away — don't recreate it for this trip. */
  activityDismissed: boolean;
  /** When the trip was detected as arrived (epoch ms). */
  arrivedAt: number | null;
  /**
   * How the trip can be followed while the phone is locked: 'background' = background location
   * keeps the app running; otherwise iOS suspends it and the Live Activity shows milestones only.
   */
  tracking: 'background' | 'foreground' | 'none';
};

type TripState = {
  trip: Trip | null;
  hydrated: boolean;
  setTrip: (t: Trip | null) => void;
  patch: (p: Partial<Trip>) => void;
};

function isValidTrip(t: unknown): t is Trip {
  const trip = t as Trip | null;
  if (!trip?.journey?.legs?.length || typeof trip.startedAt !== 'number') return false;
  if (typeof trip.anchorIdx !== 'number') return false;
  // drop trips referencing stations that no longer exist (data update)
  return trip.journey.legs.every((l) => l.stations.every((c) => stationByCode.has(c)));
}

export const useTrip = create<TripState>()(
  persist(
    (set, get) => ({
      trip: null,
      hydrated: false,
      setTrip: (trip) => set({ trip }),
      patch: (p) => {
        const t = get().trip;
        if (t) set({ trip: { ...t, ...p } });
      },
    }),
    {
      name: 'mettro-trip',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ trip: s.trip }),
      // v1 trips used a different progress model; drop them rather than guess.
      migrate: (persisted, version) => (version < 2 ? { trip: null } : (persisted as { trip: Trip | null })),
      merge: (persisted, current) => {
        const trip = (persisted as { trip?: unknown } | undefined)?.trip;
        // a trip started before hydration finished wins over the stored one
        const restored = isValidTrip(trip) ? { ...trip, tracking: trip.tracking ?? 'none' } : null;
        return { ...current, trip: current.trip ?? restored };
      },
      onRehydrateStorage: () => () => useTrip.setState({ hydrated: true }),
    },
  ),
);
