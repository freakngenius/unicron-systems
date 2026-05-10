// Wave 3 / Stream W3-H — Vercel serverless proxy that calls the Inngest
// REST API server-side and returns an aggregated payload to the
// browser-side dashboard at `/inngest-health`.
//
// The browser cannot call Inngest directly because the API key is a
// server-only secret. Sibling Phase B is also adding an `api/` folder;
// when this PR merges with that one, double-check `vercel.json` rewrites
// stay in sync. (See PR description.)
//
// Auth: reads `INNGEST_API_KEY` from the Vercel env. When unset the
// proxy returns `{ configured: false, payload: <empty> }` so the
// dashboard can render its configure-me banner instead of erroring.

import type { IncomingMessage, ServerResponse } from 'node:http';

interface InngestFunctionDef {
  id: string;
  name: string;
  cron: string | null;
  cron_cadence: 'hourly' | 'daily' | 'custom' | null;
}

interface InngestRunSummary {
  run_id: string;
  function_id: string;
  status: 'completed' | 'failed' | 'cancelled' | 'running' | 'queued' | 'unknown';
  started_at: string;
  ended_at: string | null;
}

interface InngestCronSchedule {
  function_id: string;
  next_run_at: string | null;
}

interface HealthPayload {
  generated_at: string;
  functions: InngestFunctionDef[];
  recent_runs: InngestRunSummary[];
  schedules: InngestCronSchedule[];
}

const INNGEST_API_BASE = 'https://api.inngest.com';
const RECENT_RUNS_LIMIT = 50;

/** Best-effort cadence classification from a cron expression. */
function classifyCron(cron: string | null): InngestFunctionDef['cron_cadence'] {
  if (!cron) return null;
  const trimmed = cron.trim();
  // Hourly: "0 * * * *" or "*/N * * * *" where N divides 60
  if (/^0\s+\*\s+\*\s+\*\s+\*$/.test(trimmed)) return 'hourly';
  // Daily: "M H * * *" with literal hour
  if (/^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(trimmed)) return 'daily';
  return 'custom';
}

async function callInngest(path: string, key: string): Promise<unknown> {
  const res = await fetch(`${INNGEST_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Inngest API ${path} -> ${res.status}`);
  }
  return res.json();
}

interface InngestFunctionApiRow {
  id?: string;
  slug?: string;
  name?: string;
  triggers?: Array<{ cron?: string | null }>;
}

interface InngestRunApiRow {
  run_id?: string;
  id?: string;
  function_id?: string;
  function?: { id?: string; slug?: string };
  status?: string;
  started_at?: string;
  ended_at?: string | null;
  run_started_at?: string;
}

interface InngestScheduleApiRow {
  function_id?: string;
  function?: { id?: string; slug?: string };
  next_run_at?: string | null;
}

function normalizeStatus(raw: unknown): InngestRunSummary['status'] {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'completed' || s === 'success' || s === 'succeeded') return 'completed';
  if (s === 'failed' || s === 'error' || s === 'errored') return 'failed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'running' || s === 'started') return 'running';
  if (s === 'queued' || s === 'pending' || s === 'scheduled') return 'queued';
  return 'unknown';
}

async function fetchHealthPayload(key: string): Promise<HealthPayload> {
  // Best-effort, defensive: Inngest's REST schema has evolved; we accept
  // multiple shapes and skip rows that don't match. Anything we fail to
  // parse falls through to the empty list, surfacing as "configured but
  // no data" in the UI rather than an error.
  let rawFns: InngestFunctionApiRow[] = [];
  let rawRuns: InngestRunApiRow[] = [];
  let rawSchedules: InngestScheduleApiRow[] = [];

  try {
    const fnRes = (await callInngest('/v1/functions', key)) as
      | { data?: InngestFunctionApiRow[] }
      | InngestFunctionApiRow[];
    rawFns = Array.isArray(fnRes) ? fnRes : (fnRes.data ?? []);
  } catch {
    rawFns = [];
  }

  try {
    const runRes = (await callInngest(
      `/v1/runs?limit=${RECENT_RUNS_LIMIT}`,
      key,
    )) as { data?: InngestRunApiRow[] } | InngestRunApiRow[];
    rawRuns = Array.isArray(runRes) ? runRes : (runRes.data ?? []);
  } catch {
    rawRuns = [];
  }

  try {
    const schedRes = (await callInngest('/v1/schedules', key)) as
      | { data?: InngestScheduleApiRow[] }
      | InngestScheduleApiRow[];
    rawSchedules = Array.isArray(schedRes) ? schedRes : (schedRes.data ?? []);
  } catch {
    rawSchedules = [];
  }

  const functions: InngestFunctionDef[] = rawFns
    .map((row) => {
      const id = row.id ?? row.slug;
      if (!id) return null;
      const cron =
        Array.isArray(row.triggers)
          ? (row.triggers.find((t) => typeof t.cron === 'string')?.cron ?? null)
          : null;
      const def: InngestFunctionDef = {
        id,
        name: row.name ?? id,
        cron: cron ?? null,
        cron_cadence: classifyCron(cron ?? null),
      };
      return def;
    })
    .filter((x): x is InngestFunctionDef => x !== null);

  const recent_runs: InngestRunSummary[] = rawRuns
    .map((row) => {
      const run_id = row.run_id ?? row.id;
      const function_id = row.function_id ?? row.function?.id ?? row.function?.slug;
      const started_at = row.started_at ?? row.run_started_at;
      if (!run_id || !function_id || !started_at) return null;
      return {
        run_id,
        function_id,
        status: normalizeStatus(row.status),
        started_at,
        ended_at: row.ended_at ?? null,
      };
    })
    .filter((x): x is InngestRunSummary => x !== null);

  const schedules: InngestCronSchedule[] = rawSchedules
    .map((row) => {
      const function_id = row.function_id ?? row.function?.id ?? row.function?.slug;
      if (!function_id) return null;
      return {
        function_id,
        next_run_at: row.next_run_at ?? null,
      };
    })
    .filter((x): x is InngestCronSchedule => x !== null);

  return {
    generated_at: new Date().toISOString(),
    functions,
    recent_runs,
    schedules,
  };
}

export default async function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse,
): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  const key = process.env.INNGEST_API_KEY;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');

  if (!key) {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        configured: false,
        message:
          'INNGEST_API_KEY not set on Vercel — see operator-todo for setup.',
        payload: {
          generated_at: new Date().toISOString(),
          functions: [],
          recent_runs: [],
          schedules: [],
        } satisfies HealthPayload,
      }),
    );
    return;
  }

  try {
    const payload = await fetchHealthPayload(key);
    res.statusCode = 200;
    res.end(JSON.stringify({ configured: true, payload }));
  } catch (err) {
    res.statusCode = 502;
    res.end(
      JSON.stringify({
        configured: true,
        error: 'inngest_upstream_error',
        message: err instanceof Error ? err.message : String(err),
        payload: {
          generated_at: new Date().toISOString(),
          functions: [],
          recent_runs: [],
          schedules: [],
        } satisfies HealthPayload,
      }),
    );
  }
}
