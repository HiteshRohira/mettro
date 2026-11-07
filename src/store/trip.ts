import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { stationByCode } from '@/lib/network';
import type { Journey } from '@/lib/router';

export type Fix = { lat: number; lng: number; acc: number; at: number };

/** Where the last accepted GPS fix placed the rider, in timetable terms. */
export type Anchor = {
  /** Planned time coordinate of that position on the route (ms, without delay). */
  tau: number;
  /** Station index at or just before that position. */
  idx: number;
  /** Station the rider was at, if the fix was at a station. */
  station: number | null;
  /** When the fix was taken (epoch ms). */
  at: number;
};

export type Trip = {
  journey: Journey;
  /** When the trip was started (epoch ms). */
  createdAt: number;
  /** Planned departure (epoch ms) of the first train. May be in the future (waiting for service). */
  startedAt: number;
  /** Offset from the timetable (ms, + = running late). Set by GPS; the timetable fills gaps. */
  delayMs: number;
  /** Last accepted GPS position. null until GPS has placed the rider. */
  anchor: Anchor | null;
  lastFix: Fix | null;
  /** Consecutive good fixes that disagreed with the route (wrong train / direction). */
  offRoute: number;
  /** A backwards fix waiting for confirmation by a second one. */
  backPending: Anchor | null;
  activityId: string | null;
  /** The user swiped the Live Activity away — don't recreate it for this trip. */
  activityDismissed: boolean;
  /** When the trip was detected as arrived (epoch ms), and how. */
  arrivedAt: number | null;
  arrivedBy: 'gps' | 'user' | 'time' | null;
  /**
   * How the trip can be followed while the phone is locked: 'background' = background location
   * keeps the app running; otherwise iOS suspends it and the Live Activity shows milestones only.
   */
  tracking: 'background' | 'foreground' | 'none';
};

type TripState = {
  trip: Trip | null;
  setTrip: (t: Trip | null) => void;
  patch: (p: Partial<Trip>) => void;
};

function isValidTrip(t: unknown): t is Trip {
  const trip = t as Trip | null;
  if (!trip?.journey?.legs?.length || typeof trip.startedAt !== 'number' || typeof trip.createdAt !== 'number') return false;
  // drop trips referencing stations that no longer exist (data update)
  return trip.journey.legs.every((l) => l.stations.every((c) => stationByCode.has(c)));
}

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
    {
      name: 'mettro-trip',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ trip: s.trip }),
      // earlier trip models aren't compatible; drop them (boot cleans up native tracking)
      migrate: (persisted, version) => (version < 3 ? { trip: null } : (persisted as { trip: Trip | null })),
      merge: (persisted, current) => {
        const trip = (persisted as { trip?: unknown } | undefined)?.trip;
        // a trip started before hydration finished wins over the stored one
        return { ...current, trip: current.trip ?? (isValidTrip(trip) ? trip : null) };
      },
    },
  ),
);
