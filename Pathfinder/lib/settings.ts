'use client';

// lib/settings.ts — user-pref persistence + operator-role detection.
//
// Two distinct concerns:
//   1. User preferences stored in localStorage (keyed by `pf_settings`).
//      Read by `useSettings()`, written by `updateSettings()`. Defaults
//      keep customer-facing surfaces sensible even before the user visits
//      `/settings`.
//   2. Operator-role detection. The user types their email on the settings
//      page; the server checks it against the `OPERATOR_EMAILS` env
//      allowlist via `/api/me?email=…`. Result is cached in localStorage
//      (`pf_email`) and exposed via `useIsOperator()`. This is a demo-grade
//      gate — not a security boundary. Customers without an email in the
//      allowlist never see the lead-cost toggle.

import { useEffect, useState, useSyncExternalStore } from 'react';

const SETTINGS_KEY = 'pf_settings';
const EMAIL_KEY = 'pf_email';
const API_BASE = '/pathfinder';

export type SortMode = 'score' | 'distance' | 'posted' | 'recent';
export type TimeRange = '6h' | '24h' | '7d' | '30d';

export interface PathfinderSettings {
  /** Lead-cost toggle. When true, ModelRoutingStrip shows cost columns +
   *  the per-lead footer. When false (default), they're hidden. Operators
   *  can flip this; customers don't see the toggle so it stays false. */
  showLeadCost: boolean;
  /** Default time range for dashboard counters (24h sums, etc.). */
  defaultTimeRange: TimeRange;
  /** Default branch the dashboard focuses on. `null` = "All branches". */
  defaultBranchId: string | null;
  /** Sort order on the project list. */
  defaultSort: SortMode;
  /** Show customer markers / cross-pollination warm-intros by default. */
  crossPollDefault: boolean;
  /** IANA time zone for date/timestamp rendering. Empty string = browser local zone. */
  timeZone: string;
  /** Demo-mode banner + synthetic-data indicators. */
  demoMode: boolean;
  /** "Operations view" — broader operator-only feature gate covering Pulse
   *  confidence intervals, Verifier escalation queue depth, etc. */
  operationsView: boolean;
}

export const DEFAULT_SETTINGS: PathfinderSettings = {
  showLeadCost: false,
  defaultTimeRange: '7d',
  defaultBranchId: null,
  defaultSort: 'score',
  crossPollDefault: false,
  timeZone: '',
  demoMode: false,
  operationsView: false,
};

// ────────────────────────────────────────────────────────────────────────
// Settings store — single source for the whole app. Cross-tab updates
// propagate via the `storage` event so flipping the lead-cost toggle in
// /settings updates the dashboard if it's open in another tab.
// ────────────────────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

function readRaw(): PathfinderSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PathfinderSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let cached: PathfinderSettings | null = null;

function getSnapshot(): PathfinderSettings {
  if (cached === null) cached = readRaw();
  return cached;
}

function getServerSnapshot(): PathfinderSettings {
  return DEFAULT_SETTINGS;
}

function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  // Cross-tab sync via the storage event. Triggers when *another* tab
  // writes to localStorage with our key.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SETTINGS_KEY) return;
    cached = readRaw();
    listeners.forEach((l) => l());
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Read the current Pathfinder settings. Re-renders on update. */
export function useSettings(): PathfinderSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Write a partial update. Persists to localStorage; notifies listeners. */
export function updateSettings(patch: Partial<PathfinderSettings>): void {
  const next: PathfinderSettings = { ...getSnapshot(), ...patch };
  cached = next;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors etc.
  }
  listeners.forEach((l) => l());
}

// ────────────────────────────────────────────────────────────────────────
// User-email + operator detection
// ────────────────────────────────────────────────────────────────────────

export function getUserEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function setUserEmail(email: string): void {
  try {
    window.localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    // ignore
  }
}

export function clearUserEmail(): void {
  try {
    window.localStorage.removeItem(EMAIL_KEY);
  } catch {
    // ignore
  }
}

/**
 * Check whether the current user is in the OPERATOR_EMAILS allowlist.
 * Returns `false` until the API call lands; never throws. Customers see
 * `false` (no email set, or email not in list); operators see `true`.
 */
export function useIsOperator(): boolean {
  const [isOperator, setIsOperator] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const email = getUserEmail();
    if (!email) {
      setIsOperator(false);
      return;
    }
    void fetch(`${API_BASE}/api/me?email=${encodeURIComponent(email)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { isOperator: false }))
      .then((data) => {
        if (cancelled) return;
        setIsOperator(Boolean(data?.isOperator));
      })
      .catch(() => {
        if (cancelled) return;
        setIsOperator(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return isOperator;
}

