import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { fetchLineStatuses, fetchServiceInformation, type LineStatus } from '@/lib/api';
import { LINES } from '@/lib/network';

type StatusState = {
  lines: Record<string, string>;
  service: string | null;
  checkedAt: number | null;
  error: string | null;
  loading: boolean;
  networkStationsLive: number | null;
  refresh: () => Promise<boolean>;
  set: (p: Partial<StatusState>) => void;
};

/** DMRC reports "Normal Service", "Partial Service", "No Service"… Only a leading "normal" counts. */
export const isNormal = (s?: string | null) => !s || /^\s*normal\b/i.test(s);

export const useStatus = create<StatusState>()(
  persist(
    (set, get) => ({
      lines: Object.fromEntries(LINES.map((l) => [l.id, l.status])),
      service: null,
      checkedAt: null,
      error: null,
      loading: false,
      networkStationsLive: null,
      set: (p) => set(p),
      refresh: async () => {
        if (get().loading) return false;
        set({ loading: true });
        try {
          const [ls, svc] = await Promise.all([fetchLineStatuses(), fetchServiceInformation().catch(() => null)]);
          const map: Record<string, string> = {};
          ls.forEach((l: LineStatus) => (map[l.id] = l.status));
          set({ lines: map, service: svc, checkedAt: Date.now(), error: null, loading: false });
          return true;
        } catch (e: any) {
          set({ error: e?.message ?? 'Could not reach DMRC', loading: false });
          return false;
        }
      },
    }),
    {
      name: 'mettro-status',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lines: s.lines, service: s.service, checkedAt: s.checkedAt, networkStationsLive: s.networkStationsLive }),
    },
  ),
);

export function disruptedLines(lines: Record<string, string>) {
  return LINES.filter((l) => !isNormal(lines[l.id]));
}
