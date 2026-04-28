'use client';

// lib/scoring-config.ts — client hook for the active scoring constants.
//
// Polls /api/scoring-config every 30s (changes are rare). Surfaced as a
// store so multiple consumers share one fetch. ProjectList, ProjectModal,
// dashboard, etc. read from this hook so flipping HI_THRESHOLD in
// /settings re-renders the UI immediately on the next poll.

import { useSyncExternalStore } from 'react';

export interface ScoringConfig {
  high_priority_threshold: number;
  score_tolerance: number;
  default_coverage_miles: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  high_priority_threshold: 80,
  score_tolerance: 15,
  default_coverage_miles: 300,
};

const POLL_MS = 30_000;
const API_BASE = '/pathfinder';

let cached: ScoringConfig = { ...DEFAULT_SCORING_CONFIG };
const listeners = new Set<() => void>();
let pollHandle: ReturnType<typeof setInterval> | null = null;
let refcount = 0;

async function fetchOnce(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/scoring-config`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as Partial<ScoringConfig>;
    const next: ScoringConfig = {
      high_priority_threshold:
        typeof data.high_priority_threshold === 'number'
          ? data.high_priority_threshold
          : DEFAULT_SCORING_CONFIG.high_priority_threshold,
      score_tolerance:
        typeof data.score_tolerance === 'number'
          ? data.score_tolerance
          : DEFAULT_SCORING_CONFIG.score_tolerance,
      default_coverage_miles:
        typeof data.default_coverage_miles === 'number'
          ? data.default_coverage_miles
          : DEFAULT_SCORING_CONFIG.default_coverage_miles,
    };
    if (
      next.high_priority_threshold !== cached.high_priority_threshold ||
      next.score_tolerance !== cached.score_tolerance ||
      next.default_coverage_miles !== cached.default_coverage_miles
    ) {
      cached = next;
      listeners.forEach((l) => l());
    }
  } catch {
    // ignore — last-known cached value remains valid
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  refcount++;
  if (!pollHandle) {
    void fetchOnce();
    pollHandle = setInterval(fetchOnce, POLL_MS);
  }
  return () => {
    listeners.delete(cb);
    refcount--;
    if (refcount === 0 && pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  };
}

function getSnapshot(): ScoringConfig {
  return cached;
}

function getServerSnapshot(): ScoringConfig {
  return DEFAULT_SCORING_CONFIG;
}

/** Read the active scoring config. Re-renders on poll updates. */
export function useScoringConfig(): ScoringConfig {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Force a refresh — call after POSTing /api/scoring-config so the UI
 *  reflects the new values without waiting for the 30s poll. */
export async function refreshScoringConfig(): Promise<void> {
  await fetchOnce();
}

/** Persist a new config row. Returns the saved values (server clamps). */
export async function saveScoringConfig(
  patch: Partial<ScoringConfig>,
): Promise<ScoringConfig> {
  const res = await fetch(`${API_BASE}/api/scoring-config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = (await res.json()) as { ok?: boolean; config?: ScoringConfig; error?: string };
  if (!res.ok || !data.config) {
    throw new Error(data.error ?? `save_failed_${res.status}`);
  }
  cached = data.config;
  listeners.forEach((l) => l());
  return data.config;
}

