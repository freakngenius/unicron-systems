// lib/agents/pathfinder-sync.ts — S4a Pathfinder cross-project sync.
//
// Polls the Pathfinder Supabase project (separate ref from nervous_system)
// using a service-role client pointed at PATHFINDER_SUPABASE_URL and writes
// summary metric rows into nervous_system.pathfinder_sync on this project.
//
// The cross-project client is initialised lazily: when the required env vars
// are absent, the sync degrades to a no-op that records a single audit_log
// row so the Atrium UI can surface a "Pathfinder sync awaiting credentials"
// state instead of crashing. When the env vars are pasted (see the Bug Fix
// card filed by the overnight sweep), the next Inngest invocation activates
// the live pull.
//
// Metrics emitted per run (one row per metric_key):
//   leads_total       — count of pathfinder.projects rows
//   leads_top_score   — max score from pathfinder.projects in last 24h
//   customers_total   — count of pathfinder.customers
//   agent_runs_24h    — count of pathfinder.agent_runs in last 24h
//
// Idempotency: each run inserts new rows tagged with sync_run_id. Downstream
// `ns_pathfinder_sync_latest` picks the most recent observed_at per key.

import { createClient } from '@supabase/supabase-js';

// Loose typing for cross-project client — schema narrowing on createClient
// surfaces a typed mismatch otherwise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const NERVOUS_SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const NERVOUS_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const PATHFINDER_SUPABASE_URL = process.env.PATHFINDER_SUPABASE_URL ?? '';
const PATHFINDER_SERVICE_ROLE = process.env.PATHFINDER_SUPABASE_SERVICE_ROLE_KEY ?? '';

interface SyncSummary {
  status: 'ok' | 'awaiting_credentials' | 'error';
  metrics_written: number;
  sync_run_id: string;
  error?: string;
}

function nervousClient(): AnyClient {
  return createClient(NERVOUS_SUPABASE_URL, NERVOUS_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function pathfinderClientOrNull(): AnyClient | null {
  if (!PATHFINDER_SUPABASE_URL || !PATHFINDER_SERVICE_ROLE) return null;
  return createClient(PATHFINDER_SUPABASE_URL, PATHFINDER_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'pathfinder' },
  });
}

export async function pathfinderSync(): Promise<SyncSummary> {
  const syncRunId = crypto.randomUUID();
  const nervous = nervousClient();

  const pathfinder = pathfinderClientOrNull();
  if (!pathfinder) {
    await nervous.schema('nervous_system').from('audit_log').insert({
      action: 'pathfinder_sync_awaiting_credentials',
      payload: {
        sync_run_id: syncRunId,
        missing_env: [
          PATHFINDER_SUPABASE_URL ? null : 'PATHFINDER_SUPABASE_URL',
          PATHFINDER_SERVICE_ROLE ? null : 'PATHFINDER_SUPABASE_SERVICE_ROLE_KEY',
        ].filter(Boolean),
      },
    });
    return { status: 'awaiting_credentials', metrics_written: 0, sync_run_id: syncRunId };
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const metrics: Array<{ metric_key: string; metric_value: Record<string, unknown> }> = [];

  try {
    // supabase-js returns { error } instead of throwing — explicitly check
    // each query so a partial failure does not get reported as ok.
    const leadsRes = await pathfinder
      .from('projects')
      .select('*', { head: true, count: 'exact' });
    if (leadsRes.error) throw new Error(`projects.count: ${leadsRes.error.message}`);
    metrics.push({ metric_key: 'leads_total', metric_value: { count: leadsRes.count ?? 0 } });

    const customersRes = await pathfinder
      .from('customers')
      .select('*', { head: true, count: 'exact' });
    if (customersRes.error) throw new Error(`customers.count: ${customersRes.error.message}`);
    metrics.push({ metric_key: 'customers_total', metric_value: { count: customersRes.count ?? 0 } });

    const agentRunsRes = await pathfinder
      .from('agent_runs')
      .select('*', { head: true, count: 'exact' })
      .gte('started_at', since24h);
    if (agentRunsRes.error) throw new Error(`agent_runs.count: ${agentRunsRes.error.message}`);
    metrics.push({
      metric_key: 'agent_runs_24h',
      metric_value: { count: agentRunsRes.count ?? 0, window: '24h' },
    });

    const topScoredRes = await pathfinder
      .from('projects')
      .select('id, score')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(1);
    if (topScoredRes.error) throw new Error(`projects.top: ${topScoredRes.error.message}`);
    const top = topScoredRes.data?.[0] as { id: string; score: number | null } | undefined;
    metrics.push({
      metric_key: 'leads_top_score',
      metric_value: { score: top?.score ?? null, project_id: top?.id ?? null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await nervous.schema('nervous_system').from('audit_log').insert({
      action: 'pathfinder_sync_error',
      payload: { sync_run_id: syncRunId, error: message },
    });
    return { status: 'error', metrics_written: 0, sync_run_id: syncRunId, error: message };
  }

  const rows = metrics.map((m) => ({
    metric_key: m.metric_key,
    metric_value: m.metric_value,
    sync_run_id: syncRunId,
  }));

  const { error: writeErr } = await nervous
    .schema('nervous_system')
    .from('pathfinder_sync')
    .insert(rows);

  if (writeErr) {
    await nervous.schema('nervous_system').from('audit_log').insert({
      action: 'pathfinder_sync_error',
      payload: { sync_run_id: syncRunId, error: writeErr.message, stage: 'write' },
    });
    return { status: 'error', metrics_written: 0, sync_run_id: syncRunId, error: writeErr.message };
  }

  await nervous.schema('nervous_system').from('audit_log').insert({
    action: 'pathfinder_sync_ok',
    payload: { sync_run_id: syncRunId, metrics_written: rows.length },
  });

  return { status: 'ok', metrics_written: rows.length, sync_run_id: syncRunId };
}
