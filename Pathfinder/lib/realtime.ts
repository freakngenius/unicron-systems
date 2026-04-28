'use client';

// lib/realtime.ts — Supabase realtime → React state bridge for the live layer.
//
// This file is the TypeScript port of the prototype's hifi-live event bus.
// In the prototype (`pathfinder-prototype/project/hifi-live.jsx`), all live
// state is held in module-level mutables (`_log`, `_agents`, `_models`,
// `_newPins`, `_justRanked`, `_lastIngest`, `_stats`, `_seenModals`) with
// per-store subscriber Sets. Components subscribe via tiny `useX()` hooks
// that re-render when the store fires.
//
// We keep that pattern verbatim — it's correct for this use case and lets
// the components stay 1:1 with the prototype. The only thing that changes
// is the *source* of mutations: instead of `setInterval` simulation, we
// open Supabase realtime channels on `pathfinder.agent_log`, `agent_runs`,
// and `projects`, and the channel callbacks call the same store mutators
// the simulation used to call.
//
// The realtime channels are opened lazily on first subscribe and torn down
// when the last subscriber unmounts, so SSR + tab-backgrounding stay clean.

import { useEffect, useReducer, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { AgentLogRow, AgentName, AgentRun, Project } from '@/lib/types';

// Pathfinder is mounted at `/pathfinder` via Next.js basePath. Client-side
// fetches need the prefix; server-side route handlers don't. Centralize so
// every realtime hook gets it right.
const API_BASE = '/pathfinder';

// ────────────────────────────────────────────────────────────────────────
// Generic store helper — mirrors `_log`, `_agents`, etc. plus subscriber Set.
// ────────────────────────────────────────────────────────────────────────
type Listener<T> = (value: T) => void;

class Store<T> {
  private value: T;
  private listeners = new Set<Listener<T>>();
  constructor(initial: T) {
    this.value = initial;
  }
  get(): T {
    return this.value;
  }
  set(next: T): void {
    this.value = next;
    this.listeners.forEach((fn) => fn(next));
  }
  patch(updater: (prev: T) => T): void {
    this.set(updater(this.value));
  }
  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  size(): number {
    return this.listeners.size;
  }
}

function useStoreValue<T>(store: Store<T>): T {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const valueRef = useRef<T>(store.get());
  useEffect(() => {
    valueRef.current = store.get();
    force();
    const unsub = store.subscribe((v) => {
      valueRef.current = v;
      force();
    });
    return unsub;
  }, [store]);
  return valueRef.current;
}

// ────────────────────────────────────────────────────────────────────────
// 1. Activity log feed (capped ring buffer of `pathfinder.agent_log` rows)
// ────────────────────────────────────────────────────────────────────────

export const LOG_CAP = 120;
const logStore = new Store<AgentLogRow[]>([]);

function pushLog(entry: AgentLogRow) {
  logStore.patch((prev) => {
    // dedupe by id so a backfill + realtime insert don't duplicate
    if (prev.length && prev[0].id === entry.id) return prev;
    if (prev.some((e) => e.id === entry.id)) return prev;
    return [entry, ...prev].slice(0, LOG_CAP);
  });
}

let logChannel: RealtimeChannel | null = null;
let logRefcount = 0;
let logBackfillStarted = false;

async function backfillLog(limit: number): Promise<void> {
  if (logBackfillStarted) return;
  logBackfillStarted = true;
  try {
    // Try the API route first (Stream 3 owns it; cached headers / shape).
    const res = await fetch(`${API_BASE}/api/activity?limit=${limit}`, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { events?: AgentLogRow[] } | AgentLogRow[];
      const rows = Array.isArray(data) ? data : data.events ?? [];
      // Ensure newest-first.
      const sorted = [...rows].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
      logStore.set(sorted.slice(0, LOG_CAP));
      return;
    }
  } catch {
    // fall through to direct Supabase read
  }
  // Direct fallback if /api/activity isn't ready yet.
  const { data, error } = await supabase
    .from('agent_log')
    .select('*')
    .order('ts', { ascending: false })
    .limit(limit);
  if (!error && data) {
    logStore.set(data as AgentLogRow[]);
  }
}

function ensureLogChannel(): void {
  if (logChannel) return;
  logChannel = supabase
    .channel('pf-agent-log')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'pathfinder', table: 'agent_log' },
      (payload) => {
        pushLog(payload.new as AgentLogRow);
      },
    )
    .subscribe();
}

function teardownLogChannel(): void {
  if (!logChannel) return;
  if (logRefcount > 0) return;
  supabase.removeChannel(logChannel);
  logChannel = null;
  logBackfillStarted = false;
}

/**
 * Returns the last N agent_log rows newest-first. Subscribes to inserts on
 * `pathfinder.agent_log` and rolls a 120-event ring buffer.
 */
export function useAgentLog(limit: number = LOG_CAP): AgentLogRow[] {
  useEffect(() => {
    logRefcount++;
    ensureLogChannel();
    void backfillLog(limit);
    return () => {
      logRefcount--;
      if (logRefcount === 0) {
        // Defer teardown a tick so React strict-mode double-mount doesn't churn.
        setTimeout(teardownLogChannel, 0);
      }
    };
  }, [limit]);
  return useStoreValue(logStore);
}

// ────────────────────────────────────────────────────────────────────────
// 2. Agent runs — last run per agent (ingestor / ranker / adjacent)
// ────────────────────────────────────────────────────────────────────────

export type AgentRunMap = Record<AgentName, AgentRun | null>;
const initialRunMap: AgentRunMap = { ingestor: null, ranker: null, adjacent: null };
const runsStore = new Store<AgentRunMap>(initialRunMap);

function patchRun(row: AgentRun) {
  runsStore.patch((prev) => {
    const cur = prev[row.agent_name];
    if (cur && +new Date(cur.started_at) > +new Date(row.started_at)) return prev;
    return { ...prev, [row.agent_name]: row };
  });
}

let runsChannel: RealtimeChannel | null = null;
let runsRefcount = 0;
let runsBackfillStarted = false;

async function backfillRuns(): Promise<void> {
  if (runsBackfillStarted) return;
  runsBackfillStarted = true;
  try {
    const res = await fetch(`${API_BASE}/api/agents`, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as
        | { agents?: AgentRunMap }
        | AgentRunMap
        | AgentRun[];
      let map: AgentRunMap = { ...initialRunMap };
      if (Array.isArray(data)) {
        for (const r of data) map[r.agent_name] = r;
      } else if ((data as { agents?: AgentRunMap }).agents) {
        map = { ...map, ...(data as { agents: AgentRunMap }).agents };
      } else {
        map = { ...map, ...(data as AgentRunMap) };
      }
      runsStore.set(map);
      return;
    }
  } catch {
    // fall through
  }
  // Direct Supabase fallback — newest run per agent.
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(60);
  if (error || !data) return;
  const map: AgentRunMap = { ...initialRunMap };
  for (const r of data as AgentRun[]) {
    if (!map[r.agent_name]) map[r.agent_name] = r;
  }
  runsStore.set(map);
}

function ensureRunsChannel(): void {
  if (runsChannel) return;
  runsChannel = supabase
    .channel('pf-agent-runs')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'pathfinder', table: 'agent_runs' },
      (payload) => patchRun(payload.new as AgentRun),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'pathfinder', table: 'agent_runs' },
      (payload) => patchRun(payload.new as AgentRun),
    )
    .subscribe();
}

function teardownRunsChannel(): void {
  if (!runsChannel) return;
  if (runsRefcount > 0) return;
  supabase.removeChannel(runsChannel);
  runsChannel = null;
  runsBackfillStarted = false;
}

/**
 * Returns the most recent run per agent. Backed by `pathfinder.agent_runs`
 * inserts/updates. Initial fetch via `/api/agents`.
 */
export function useAgentRuns(): AgentRunMap {
  useEffect(() => {
    runsRefcount++;
    ensureRunsChannel();
    void backfillRuns();
    return () => {
      runsRefcount--;
      if (runsRefcount === 0) setTimeout(teardownRunsChannel, 0);
    };
  }, []);
  return useStoreValue(runsStore);
}

// ────────────────────────────────────────────────────────────────────────
// 3. New-pin set + just-ranked set + last-ingest + project realtime spine
//
// One projects channel feeds three downstream stores:
//   - newPinsStore — IDs of projects inserted in the last 700ms (sonar)
//   - justRankedStore — IDs that just got a non-null score (count-up)
//   - lastIngestStore — max(ingested_at) timestamp
// ────────────────────────────────────────────────────────────────────────

const newPinsStore = new Store<Set<string>>(new Set());
const justRankedStore = new Store<Set<string>>(new Set());
const lastIngestStore = new Store<number>(Date.now());

const NEW_PIN_TTL_MS = 700;
const JUST_RANKED_TTL_MS = 800;

function markPinNew(id: string) {
  newPinsStore.patch((prev) => {
    const next = new Set(prev);
    next.add(id);
    return next;
  });
  setTimeout(() => {
    newPinsStore.patch((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, NEW_PIN_TTL_MS);
}

function markRanked(id: string) {
  justRankedStore.patch((prev) => {
    const next = new Set(prev);
    next.add(id);
    return next;
  });
  setTimeout(() => {
    justRankedStore.patch((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, JUST_RANKED_TTL_MS);
}

function bumpIngest(ts: string | number = Date.now()) {
  const value = typeof ts === 'string' ? +new Date(ts) : ts;
  lastIngestStore.patch((prev) => (value > prev ? value : prev));
}

let projectsChannel: RealtimeChannel | null = null;
let projectsRefcount = 0;
let lastIngestBackfillStarted = false;

async function backfillLastIngest(): Promise<void> {
  if (lastIngestBackfillStarted) return;
  lastIngestBackfillStarted = true;
  const { data, error } = await supabase
    .from('projects')
    .select('ingested_at')
    .order('ingested_at', { ascending: false })
    .limit(1);
  if (!error && data && data.length) {
    bumpIngest((data[0] as { ingested_at: string }).ingested_at);
  }
}

function ensureProjectsChannel(): void {
  if (projectsChannel) return;
  projectsChannel = supabase
    .channel('pf-projects')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'pathfinder', table: 'projects' },
      (payload) => {
        const row = payload.new as Project;
        if (row.id) markPinNew(row.id);
        if (row.ingested_at) bumpIngest(row.ingested_at);
        // Bump stats locally so counters tick before the 5s poll.
        statsStore.patch(({ stats, bumped }) => ({
          stats: { ...stats, total: stats.total + 1 },
          bumped: { ...bumped, total: Date.now() },
        }));
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'pathfinder', table: 'projects' },
      (payload) => {
        const next = payload.new as Project;
        const prev = (payload.old as Project) || ({} as Project);
        // Score went null → non-null: count-up + ranked++ (and possibly new++)
        if (next.score != null && prev.score == null && next.id) {
          markRanked(next.id);
          statsStore.patch(({ stats, bumped }) => ({
            stats: { ...stats, ranked: stats.ranked + 1 },
            bumped: { ...bumped, ranked: Date.now() },
          }));
        }
      },
    )
    .subscribe();
}

function teardownProjectsChannel(): void {
  if (!projectsChannel) return;
  if (projectsRefcount > 0) return;
  supabase.removeChannel(projectsChannel);
  projectsChannel = null;
  lastIngestBackfillStarted = false;
}

function useProjectsChannel() {
  useEffect(() => {
    projectsRefcount++;
    ensureProjectsChannel();
    void backfillLastIngest();
    return () => {
      projectsRefcount--;
      if (projectsRefcount === 0) setTimeout(teardownProjectsChannel, 0);
    };
  }, []);
}

/**
 * Set of project IDs inserted in the last ~700ms. Map.tsx renders a
 * `<SonarPing>` for each ID. (Backs the prototype's `useNewPins`.)
 */
export function useNewPins(): Set<string> {
  useProjectsChannel();
  return useStoreValue(newPinsStore);
}

/**
 * Set of project IDs whose score just transitioned from null → non-null.
 * Map.tsx swaps the score chip for a `<CountUpScore>` while the ID is in
 * the set. (Backs the prototype's `useJustRanked`.)
 */
export function useJustRanked(): Set<string> {
  useProjectsChannel();
  return useStoreValue(justRankedStore);
}

/**
 * Most-recent `pathfinder.projects.ingested_at` timestamp (ms epoch).
 * Cached + invalidated on insert.
 */
export function useLastIngest(): number {
  useProjectsChannel();
  return useStoreValue(lastIngestStore);
}

/** Lower-level emitter — fires project IDs as inserts arrive (no TTL). */
export function useProjectInserts(onId: (id: string) => void): void {
  useProjectsChannel();
  useEffect(() => {
    const unsub = newPinsStore.subscribe((set) => {
      // Best-effort: when the set grows, surface the most recent additions.
      // Newest-first ordering isn't guaranteed by Set iteration, so callers
      // should treat this as "any new pin landed". Most consumers just want
      // useNewPins() directly.
      set.forEach((id) => onId(id));
    });
    return unsub;
  }, [onId]);
}

/** Lower-level emitter — fires when a project's score transitions null→set. */
export function useProjectScored(onId: (id: string) => void): void {
  useProjectsChannel();
  useEffect(() => {
    const unsub = justRankedStore.subscribe((set) => {
      set.forEach((id) => onId(id));
    });
    return unsub;
  }, [onId]);
}

// ────────────────────────────────────────────────────────────────────────
// 4. Stats counters (new / total / ranked / err) — poll + realtime bumps
// ────────────────────────────────────────────────────────────────────────

export interface PfStats {
  new: number;
  total: number;
  ranked: number;
  err: number;
}
export type StatsKey = keyof PfStats;
export interface StatsBumps {
  new: number;
  total: number;
  ranked: number;
  err: number;
}
export interface StatsBundle {
  stats: PfStats;
  bumped: StatsBumps;
}

const initialStats: StatsBundle = {
  stats: { new: 0, total: 0, ranked: 0, err: 0 },
  bumped: { new: 0, total: 0, ranked: 0, err: 0 },
};
const statsStore = new Store<StatsBundle>(initialStats);

const STATS_POLL_MS = 5000;
let statsPollHandle: ReturnType<typeof setInterval> | null = null;
let statsRefcount = 0;

async function fetchStatsOnce(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/stats`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as Partial<PfStats> | { stats?: Partial<PfStats> };
    const incoming = (data as { stats?: Partial<PfStats> }).stats ?? (data as Partial<PfStats>);
    statsStore.patch(({ stats, bumped }) => {
      const next: PfStats = {
        new: incoming.new ?? stats.new,
        total: incoming.total ?? stats.total,
        ranked: incoming.ranked ?? stats.ranked,
        err: incoming.err ?? stats.err,
      };
      const nextBumped: StatsBumps = { ...bumped };
      const now = Date.now();
      (Object.keys(next) as StatsKey[]).forEach((k) => {
        if (next[k] !== stats[k]) nextBumped[k] = now;
      });
      return { stats: next, bumped: nextBumped };
    });
  } catch {
    // ignore — keep last value
  }
}

/**
 * `{ stats, bumped }` — `stats` is the live counter set; `bumped[key]` is
 * a timestamp of the most recent change for that key, used to flash the
 * value when it ticks. Polls `/api/stats` every 5s; project realtime
 * inserts/updates patch the store immediately for instant ticks.
 */
export function useStats(): StatsBundle {
  // ensure the projects channel is also live for instant ticks
  useProjectsChannel();
  useEffect(() => {
    statsRefcount++;
    if (!statsPollHandle) {
      void fetchStatsOnce();
      statsPollHandle = setInterval(fetchStatsOnce, STATS_POLL_MS);
    }
    return () => {
      statsRefcount--;
      if (statsRefcount === 0 && statsPollHandle) {
        clearInterval(statsPollHandle);
        statsPollHandle = null;
      }
    };
  }, []);
  return useStoreValue(statsStore);
}

// ────────────────────────────────────────────────────────────────────────
// 5. Multi-model routing — derived from `agent_log` rows where
//    event_type='model_route' and model_used is set.
// ────────────────────────────────────────────────────────────────────────

export interface ModelMeta {
  purpose: string;
  costPerCall: number;
}
export const MODEL_META: Record<string, ModelMeta> = {
  'local-geocoder': { purpose: 'branch matching', costPerCall: 0.0 },
  'gpt-oss-20b': { purpose: 'stage classify', costPerCall: 0.00056 },
  'claude-haiku': { purpose: 'entity dedup', costPerCall: 0.0019 },
  'claude-sonnet': { purpose: 'rationale gen', costPerCall: 0.0054 },
};

export interface ModelsBundle {
  models: Record<string, number>;
  avgMs: number;
  ranked: number;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Computes per-model call counts in the last hour from the agent_log buffer.
 * Returns the bundle the prototype's `useModels()` returned: `{ models, avgMs, ranked }`.
 */
export function useModels(): ModelsBundle {
  const log = useAgentLog();
  const runs = useAgentRuns();
  const cutoff = Date.now() - ONE_HOUR_MS;
  const models: Record<string, number> = {};
  let totalLat = 0;
  let latCount = 0;
  for (const row of log) {
    if (+new Date(row.ts) < cutoff) continue;
    if (row.event_type !== 'model_route') continue;
    if (!row.model_used) continue;
    models[row.model_used] = (models[row.model_used] || 0) + 1;
    if (typeof row.latency_ms === 'number') {
      totalLat += row.latency_ms;
      latCount++;
    }
  }
  // ranked-this-hour: prefer ranker run records_processed; fall back to log
  let ranked = 0;
  const ranker = runs.ranker;
  if (ranker && +new Date(ranker.started_at) >= cutoff) {
    ranked = ranker.records_processed ?? 0;
  } else {
    for (const row of log) {
      if (+new Date(row.ts) < cutoff) continue;
      if (row.agent_name === 'ranker' && row.event_type === 'rank_success') ranked++;
    }
  }
  const avgMs = latCount > 0 ? totalLat / latCount : 0;
  return { models, avgMs, ranked };
}

// ────────────────────────────────────────────────────────────────────────
// 6. Header height + rail height — published refs other panels read.
//    Mirrors prototype lines 626-648 (window.__pfHeaderHeight / __pfActivityHeight).
// ────────────────────────────────────────────────────────────────────────

const headerHeightStore = new Store<number>(184);
const railHeightStore = new Store<number>(52);

/** Read the header (agent row + model strip) height. Default 184. */
export function useHeaderHeight(): number {
  return useStoreValue(headerHeightStore);
}
/** Setter — only AgentStatusRow should call this on mount/resize. */
export function setHeaderHeight(h: number): void {
  if (headerHeightStore.get() === h) return;
  headerHeightStore.set(h);
}

/** Read the activity-rail published height. Default 52 (collapsed). */
export function useRailHeight(): number {
  return useStoreValue(railHeightStore);
}
/** Setter — only ActivityRail should call this on open/close. */
export function setRailHeight(h: number): void {
  if (railHeightStore.get() === h) return;
  railHeightStore.set(h);
}

// ────────────────────────────────────────────────────────────────────────
// 7. Seen-modal Set (typewriter once). In-memory only; resets on reload.
//    Mirrors prototype lines 132-134.
// ────────────────────────────────────────────────────────────────────────

const _seenModals = new Set<string>();
export function isFirstOpen(id: string): boolean {
  return !_seenModals.has(id);
}
export function markSeen(id: string): void {
  _seenModals.add(id);
}

// ────────────────────────────────────────────────────────────────────────
// 8. Mount-once style injector for the keyframes the components rely on.
// ────────────────────────────────────────────────────────────────────────

export function useLiveKeyframes(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('pf-pulse-kf')) return;
    const s = document.createElement('style');
    s.id = 'pf-pulse-kf';
    s.textContent = `
      @keyframes pf-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.18); opacity: 0.78; }
      }
      @keyframes pf-pulse-ring {
        0% { transform: scale(0.8); opacity: 0.55; }
        100% { transform: scale(2.4); opacity: 0; }
      }
      @keyframes pf-flash {
        0% { background: rgba(34,211,238,0.14); }
        100% { background: transparent; }
      }
      .pf-flash-stat { animation: pf-flash 900ms ease-out; }
      .pf-blink { animation: pf-pulse 1200ms ease-in-out infinite; }
      .pf-mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
      .pf-label { font: 500 10px/1.2 "JetBrains Mono", ui-monospace, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
      .pf-num { font: 600 14px/1 "JetBrains Mono", ui-monospace, monospace; color: #0a0a0a; font-variant-numeric: tabular-nums; }
      .pf-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
      .pf-scrollbar::-webkit-scrollbar-thumb { background: rgba(10,10,10,0.12); border-radius: 3px; }
    `;
    document.head.appendChild(s);
  }, []);
}

// Re-export tints so consumers can `import { agentTint } from '@/lib/realtime'`
// or pull from `@/lib/agent-tints` — both work.
export { agentTint, AGENTS } from '@/lib/agent-tints';
