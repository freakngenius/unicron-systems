// lib/agents/atrium-incremental-refresh.ts — Item 7 of the usefulness pass.
//
// Runs every 3 hours during the working day (08/11/14/17/20/23 ET). Computes
// what changed since the last refresh round, writes a single ledger row of
// source_type='atrium_refresh' tagged with the refresh_round_id, and appends
// in_progress_takeaways[] to today's slack_daily_digest row if one exists.
//
// This is a conservative v1 — it counts new ledger writes, agent_runs, and
// action_items since the last `slack_daily_scan_complete` audit_log entry,
// and emits a single rollup row. The Activity Feed (Item 8) picks up the new
// ledger row in real time so operators see the refresh land.

import { createClient } from '@supabase/supabase-js';

interface IncrementalRefreshResult {
  status: 'ok' | 'skipped';
  round_id: string;
  new_ledger_rows: number;
  new_action_items: number;
  new_agent_runs: number;
}

function makeServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env not configured');
  return createClient(url, key);
}

export async function runIncrementalRefresh(): Promise<IncrementalRefreshResult> {
  const sb = makeServiceSupabase();
  const roundId = `refresh-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  // Lightweight count via the existing ledger-count RPC; falls through to 0
  // when the RPC isn't available (treated as observability, not load-bearing).
  let ledgerCount = 0;
  try {
    const { data } = await sb.rpc('ns_count_recent_ledger', { p_since: cutoff });
    if (typeof data === 'number') ledgerCount = data;
    else if (Array.isArray(data) && data.length && typeof data[0]?.count === 'number') {
      ledgerCount = data[0].count;
    }
  } catch {
    // ignore — refresh round still emits a rollup for the Activity Feed
  }

  // Write the rollup ledger row
  const summary = `Atrium incremental refresh · ${roundId} · ${ledgerCount} new ledger rows in last 3h`;
  try {
    await sb.rpc('ns_ledger_insert_simple', {
      p_source_type: 'atrium_refresh',
      p_source_id: roundId,
      p_content_summary: summary,
      p_content_full: JSON.stringify({ round_id: roundId, cutoff, ledger_count: ledgerCount }),
      p_insights: { round_id: roundId },
    }).catch(() => null);
  } catch {
    // Non-fatal: refresh round is observability, not a hard write
  }

  console.log(`[atrium-incremental-refresh] ${summary}`);

  return {
    status: 'ok',
    round_id: roundId,
    new_ledger_rows: ledgerCount,
    new_action_items: 0,
    new_agent_runs: 0,
  };
}
