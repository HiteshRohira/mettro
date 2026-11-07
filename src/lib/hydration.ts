import { useSettings } from '@/store/settings';
import { useStatus } from '@/store/status';
import { useTrip } from '@/store/trip';

type PersistApi = { persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } };

function waitFor(store: PersistApi, timeoutMs: number) {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(done, timeoutMs);
    const unsub = store.persist.onFinishHydration(done);
    function done() {
      clearTimeout(t);
      unsub();
      resolve();
    }
  });
}

/**
 * Resolves once persisted stores are loaded from AsyncStorage. Background tasks can run in a fresh
 * JS runtime where stores start empty, so they must await this before reading state.
 */
export function whenHydrated(timeoutMs = 5000) {
  return Promise.all([
    waitFor(useTrip as unknown as PersistApi, timeoutMs),
    waitFor(useSettings as unknown as PersistApi, timeoutMs),
    waitFor(useStatus as unknown as PersistApi, timeoutMs),
  ]).then(() => undefined);
}
