import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getAiUsageSnapshot, getCachedAiUsageSnapshot } from "@/desktop/renderer/actions/aiUsage";
import type { AiUsageSnapshot } from "@/lib/aiUsage/types";

const AI_USAGE_CACHE_DURATION_MS = 60_000;
interface UsageStore {
  snapshot: AiUsageSnapshot | null;
  isRefreshing: boolean;
  hasFailed: boolean;
}
let state: UsageStore = { snapshot: null, isRefreshing: false, hasFailed: false };
let lastFetchedAt = 0;
let pendingRequest: Promise<void> | null = null;
let hasRequestedCache = false;
let generation = 0;
const listeners = new Set<() => void>();
const getState = () => state;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function update(patch: Partial<UsageStore>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

// Share both the snapshot and the pending request across pages and panels.
async function loadSnapshot(force = false): Promise<void> {
  if (pendingRequest) return pendingRequest;
  if (!force && lastFetchedAt && Date.now() - lastFetchedAt < AI_USAGE_CACHE_DURATION_MS) return;
  const requestGeneration = generation;
  update({ isRefreshing: true });
  pendingRequest = (async () => {
    try {
      const snapshot = await getAiUsageSnapshot();
      if (requestGeneration !== generation) return;
      lastFetchedAt = Date.now();
      update({ snapshot, hasFailed: false });
    } catch {
      if (requestGeneration === generation) update({ hasFailed: true });
    } finally {
      if (requestGeneration === generation) {
        pendingRequest = null;
        update({ isRefreshing: false });
      }
    }
  })();
  return pendingRequest;
}

async function showCachedSnapshot() {
  if (hasRequestedCache) return;
  hasRequestedCache = true;
  const requestGeneration = generation;
  try {
    const snapshot = await getCachedAiUsageSnapshot();
    if (snapshot && !state.snapshot && requestGeneration === generation) update({ snapshot });
  } catch {
    // A failed disk read must not block the live request.
  }
}

// Login and account changes invalidate old responses as well as cached data.
export function invalidateAiUsage() {
  generation += 1;
  const refreshGeneration = generation;
  const previousRequest = pendingRequest;
  pendingRequest = null;
  lastFetchedAt = 0;
  hasRequestedCache = true;
  update({ snapshot: null, hasFailed: false, isRefreshing: true });
  if (previousRequest) {
    // Let the old credential/CLI read finish before starting a fresh one.
    pendingRequest = previousRequest.then(() => {
      if (refreshGeneration !== generation) return;
      pendingRequest = null;
      return loadSnapshot(true);
    });
  } else {
    void loadSnapshot(true);
  }
}

export interface AiUsageState {
  snapshot: AiUsageSnapshot | null;
  isLoading: boolean;
  isRefreshing: boolean;
  hasFailed: boolean;
  refresh: () => void;
}

export function useAiUsage(isOpen: boolean): AiUsageState {
  const current = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    if (!isOpen) return;
    void showCachedSnapshot();
    void loadSnapshot();
  }, [isOpen]);
  const refresh = useCallback(() => { void loadSnapshot(true); }, []);
  return { ...current, isLoading: current.isRefreshing && !current.snapshot, refresh };
}
