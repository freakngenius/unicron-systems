// Eval dashboard client (Wave 3, Stream W3-F).
//
// Reads from `pathfinder.agent_runs` — the Pathfinder cron + Inngest pipeline
// writes a row per agent run with `status` ('running' | 'success' | 'failed').
// We treat `success` as "passed" and `failed` as "failed" for pass-rate
// purposes; rows still in the `running` state are excluded from the
// denominator so transient runs don't drag the rate down.
//
// `agent_eval_results` does not exist in the current schema (verified against
// 0002_tables.sql + 0005_agent_expansion_layer1.sql). When/if Pathfinder
// adds a dedicated eval table, swap the source query in `fetchEvalRuns()`
// — the data-shaping helpers below are agnostic to where the rows come from
// as long as they conform to `EvalRun`.

import { getSupabase } from './supabase';
import type { AgentName } from './activity';

export type EvalRun = {
  id: number;
  agent_name: AgentName;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed';
  error_message: string | null;
};

export type TimeWindow = 'today' | '7d' | '30d' | 'all';

export type WeeklyBin = {
  /** ISO date (YYYY-MM-DD) for the Monday that starts the week. */
  weekStart: string;
  total: number;
  passed: number;
  failed: number;
  /** passed / (passed + failed); null when no terminal runs in the bin. */
  passRate: number | null;
};

export type AgentSeries = {
  agentName: AgentName;
  bins: WeeklyBin[];
};

export type Kpis = {
  total: number;
  passed: number;
  failed: number;
  passRate: number | null;
};

export type FailureSample = {
  id: number;
  agentName: AgentName;
  startedAt: string;
  errorExcerpt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch eval-relevant agent runs from the Supabase pathfinder schema.
 * Returns an empty array when Supabase has no rows for the window.
 */
export async function fetchEvalRuns(window: TimeWindow): Promise<EvalRun[]> {
  const supabase = getSupabase();
  let query = supabase
    .schema('pathfinder')
    .from('agent_runs')
    .select('id, agent_name, started_at, completed_at, status, error_message')
    .order('started_at', { ascending: false })
    .limit(2000);

  const since = sinceForWindow(window);
  if (since) query = query.gte('started_at', since);

  const { data, error } = await query;
  if (error) throw new Error(`agent_runs read failed: ${error.message}`);
  return (data ?? []) as EvalRun[];
}

export function sinceForWindow(window: TimeWindow, now: number = Date.now()): string | null {
  switch (window) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    case '7d':
      return new Date(now - 7 * DAY_MS).toISOString();
    case '30d':
      return new Date(now - 30 * DAY_MS).toISOString();
    case 'all':
    default:
      return null;
  }
}

/**
 * Filter runs to a window and (optionally) a set of agent names.
 * Pure — exported for the data-shaping vitest suite.
 */
export function filterRuns(
  runs: EvalRun[],
  window: TimeWindow,
  agents: AgentName[] | null,
  now: number = Date.now(),
): EvalRun[] {
  const since = sinceForWindow(window, now);
  const sinceMs = since ? Date.parse(since) : null;
  return runs.filter((r) => {
    if (sinceMs !== null) {
      const t = Date.parse(r.started_at);
      if (Number.isNaN(t) || t < sinceMs) return false;
    }
    if (agents && agents.length > 0 && !agents.includes(r.agent_name)) return false;
    return true;
  });
}

/**
 * Compute headline KPIs (total, passed, failed, pass rate) for a set of runs.
 * Running rows are excluded from passed/failed but counted in total.
 */
export function computeKpis(runs: EvalRun[]): Kpis {
  let passed = 0;
  let failed = 0;
  for (const r of runs) {
    if (r.status === 'success') passed += 1;
    else if (r.status === 'failed') failed += 1;
  }
  const terminal = passed + failed;
  return {
    total: runs.length,
    passed,
    failed,
    passRate: terminal === 0 ? null : passed / terminal,
  };
}

/**
 * Returns the ISO date (YYYY-MM-DD) for the Monday at or before `ts`.
 * Used as the bin key for weekly aggregation.
 */
export function isoWeekStart(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts.getTime());
  // getUTCDay: Sun=0..Sat=6. Convert to Mon=0..Sun=6.
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Bin runs into per-agent weekly buckets, sorted oldest → newest.
 * Each agent's series only contains weeks where it had at least one run.
 */
export function binByWeekPerAgent(runs: EvalRun[]): AgentSeries[] {
  const byAgent = new Map<AgentName, Map<string, WeeklyBin>>();
  for (const r of runs) {
    const week = isoWeekStart(r.started_at);
    let weeks = byAgent.get(r.agent_name);
    if (!weeks) {
      weeks = new Map();
      byAgent.set(r.agent_name, weeks);
    }
    let bin = weeks.get(week);
    if (!bin) {
      bin = { weekStart: week, total: 0, passed: 0, failed: 0, passRate: null };
      weeks.set(week, bin);
    }
    bin.total += 1;
    if (r.status === 'success') bin.passed += 1;
    else if (r.status === 'failed') bin.failed += 1;
  }

  const series: AgentSeries[] = [];
  for (const [agent, weeks] of byAgent.entries()) {
    const bins: WeeklyBin[] = [];
    for (const bin of weeks.values()) {
      const terminal = bin.passed + bin.failed;
      bin.passRate = terminal === 0 ? null : bin.passed / terminal;
      bins.push(bin);
    }
    bins.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    series.push({ agentName: agent, bins });
  }
  series.sort((a, b) => a.agentName.localeCompare(b.agentName));
  return series;
}

/**
 * Most-recent N failures, oldest excerpts trimmed to 160 chars.
 */
export function recentFailures(runs: EvalRun[], limit = 10): FailureSample[] {
  return runs
    .filter((r) => r.status === 'failed')
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      agentName: r.agent_name,
      startedAt: r.started_at,
      errorExcerpt: (r.error_message ?? '').slice(0, 160) || '(no error message)',
    }));
}

/** Derive the unique agent names present in the data, sorted alphabetically. */
export function listAgentNames(runs: EvalRun[]): AgentName[] {
  const set = new Set<AgentName>();
  for (const r of runs) set.add(r.agent_name);
  return Array.from(set).sort();
}

