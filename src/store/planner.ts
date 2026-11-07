import { create } from 'zustand';

type PlannerState = {
  from: string | null;
  to: string | null;
  fromIsLocation: boolean;
  when: number | null; // null = now
  set: (p: Partial<Omit<PlannerState, 'set' | 'swap'>>) => void;
  swap: () => void;
};

export const usePlanner = create<PlannerState>()((set, get) => ({
  from: null,
  to: null,
  fromIsLocation: false,
  when: null,
  set: (p) => set(p),
  swap: () => set({ from: get().to, to: get().from, fromIsLocation: false }),
}));
