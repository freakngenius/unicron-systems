// lib/probe-cache.ts — shared 5-minute module-scoped cache for connector
// status probes. Per-Lambda instance; we accept that warm instances may
// hold a slightly older value than a cold-started peer for up to TTL_MS.
// That's fine for status badges that refresh on settings-page navigation.

export interface ProbeRecord<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 5 * 60_000;

const store = new Map<string, ProbeRecord<unknown>>();

export function getCached<T>(key: string): T | null {
  const rec = store.get(key);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    store.delete(key);
    return null;
  }
  return rec.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number = TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearCached(key?: string): void {
  if (key == null) {
    store.clear();
    return;
  }
  store.delete(key);
}

export const __test__ = { store, TTL_MS };
