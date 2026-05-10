// Wave 3 / Stream W3-H — read-only health monitor for Inngest scheduled
// functions and event-driven crons. Pulls from Inngest REST API via a
// thin Vercel serverless proxy (`/api/inngest/health`) so the API key
// never ships to the browser.
//
// Scope: list registered functions + recent runs + cron schedules.
// Derives per-function status (last success / last failure / 24h failure
// rate / next scheduled run) into a flat grid the view can render.

export type InngestRunStatus =
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'running'
  | 'queued'
  | 'unknown';

export interface InngestFunctionDef {
  /** Inngest function ID, e.g. "metacron/sync-hubspot". */
  id: string;
  /** Human-readable name. Falls back to `id` when missing. */
  name: string;
  /** Cron expression, if this is a cron-driven function. */
  cron: string | null;
  /** Human label of the cron cadence ('hourly' | 'daily' | 'custom'). */
  cron_cadence: 'hourly' | 'daily' | 'custom' | null;
}

export interface InngestRunSummary {
  run_id: string;
  function_id: string;
  status: InngestRunStatus;
  started_at: string; // ISO
  ended_at: string | null;
}

export interface InngestCronSchedule {
  function_id: string;
  /** Next scheduled UTC ISO timestamp. */
  next_run_at: string | null;
}

/**
 * Aggregated per-function status the view renders. Pure derivation from
 * the raw API payload — exposed so we can unit-test deterministically.
 */
export interface InngestFunctionHealth {
  function_id: string;
  name: string;
  cron: string | null;
  cron_cadence: 'hourly' | 'daily' | 'custom' | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_rate_24h: number; // 0..1
  total_runs_24h: number;
  next_run_at: string | null;
  /** UI tone: red if >50% failure rate; yellow if hourly cron and >24h
   *  since last success; green otherwise. `unknown` when no runs yet. */
  tone: 'red' | 'yellow' | 'green' | 'unknown';
}

export interface InngestHealthPayload {
  generated_at: string;
  functions: InngestFunctionDef[];
  recent_runs: InngestRunSummary[];
  schedules: InngestCronSchedule[];
}

export interface InngestHealthRollup {
  generated_at: string;
  /** True when the proxy returned a configure-me payload (no API key). */
  configured: boolean;
  totals: {
    functions: number;
    runs_24h: number;
    failed_24h: number;
  };
  byFunction: InngestFunctionHealth[];
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const RED_FAILURE_THRESHOLD = 0.5;

/**
 * Pure derivation from raw API payload to the per-function rollup the
 * grid renders. Exported for unit tests; `now` is injectable so tests
 * pin the 24h window deterministically.
 */
export function deriveInngestRollup(
  payload: InngestHealthPayload,
  now: Date = new Date(),
): InngestHealthRollup {
  const cutoff = now.getTime() - ONE_DAY_MS;
  const scheduleByFn = new Map<string, string | null>();
  for (const s of payload.schedules) {
    scheduleByFn.set(s.function_id, s.next_run_at);
  }

  const runsByFn = new Map<string, InngestRunSummary[]>();
  for (const r of payload.recent_runs) {
    const list = runsByFn.get(r.function_id) ?? [];
    list.push(r);
    runsByFn.set(r.function_id, list);
  }

  let totalRuns24h = 0;
  let totalFailed24h = 0;

  const byFunction: InngestFunctionHealth[] = payload.functions.map((fn) => {
    const runs = runsByFn.get(fn.id) ?? [];
    let lastSuccess: string | null = null;
    let lastFailure: string | null = null;
    let runs24h = 0;
    let failed24h = 0;

    for (const r of runs) {
      const startedMs = Date.parse(r.started_at);
      if (Number.isNaN(startedMs)) continue;
      if (r.status === 'completed') {
        if (!lastSuccess || Date.parse(r.started_at) > Date.parse(lastSuccess)) {
          lastSuccess = r.started_at;
        }
      }
      if (r.status === 'failed') {
        if (!lastFailure || Date.parse(r.started_at) > Date.parse(lastFailure)) {
          lastFailure = r.started_at;
        }
      }
      if (startedMs >= cutoff) {
        runs24h += 1;
        if (r.status === 'failed') failed24h += 1;
      }
    }

    totalRuns24h += runs24h;
    totalFailed24h += failed24h;

    const failureRate = runs24h > 0 ? failed24h / runs24h : 0;
    const tone = deriveTone({
      runs24h,
      failureRate,
      cron_cadence: fn.cron_cadence,
      lastSuccessAt: lastSuccess,
      now,
    });

    return {
      function_id: fn.id,
      name: fn.name || fn.id,
      cron: fn.cron,
      cron_cadence: fn.cron_cadence,
      last_success_at: lastSuccess,
      last_failure_at: lastFailure,
      failure_rate_24h: failureRate,
      total_runs_24h: runs24h,
      next_run_at: scheduleByFn.get(fn.id) ?? null,
      tone,
    };
  });

  return {
    generated_at: payload.generated_at,
    configured: payload.functions.length > 0 || payload.recent_runs.length > 0,
    totals: {
      functions: payload.functions.length,
      runs_24h: totalRuns24h,
      failed_24h: totalFailed24h,
    },
    byFunction,
  };
}

function deriveTone(args: {
  runs24h: number;
  failureRate: number;
  cron_cadence: 'hourly' | 'daily' | 'custom' | null;
  lastSuccessAt: string | null;
  now: Date;
}): 'red' | 'yellow' | 'green' | 'unknown' {
  const { runs24h, failureRate, cron_cadence, lastSuccessAt, now } = args;
  if (runs24h > 0 && failureRate > RED_FAILURE_THRESHOLD) return 'red';
  if (cron_cadence === 'hourly') {
    if (!lastSuccessAt) return 'yellow';
    const ageMs = now.getTime() - Date.parse(lastSuccessAt);
    if (Number.isFinite(ageMs) && ageMs > ONE_DAY_MS) return 'yellow';
  }
  if (runs24h === 0 && !lastSuccessAt) return 'unknown';
  return 'green';
}

export const INNGEST_HEALTH_EMPTY_PAYLOAD: InngestHealthPayload = {
  generated_at: new Date(0).toISOString(),
  functions: [],
  recent_runs: [],
  schedules: [],
};
