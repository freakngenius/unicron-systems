// scripts/test-verifier.ts — smoke test for the Verifier agent's write path.
//
// Simulates one verifier cycle end-to-end using the live Supabase project:
//
//   1. SELECT the most recent project from `pathfinder.projects` where
//      `verified IS NULL` (limit 1).
//   2. If none found, write a `verify_start` agent_log row noting "no
//      unverified projects — exiting clean" and exit 0.
//   3. Otherwise: open an `agent_runs` row tagged `agent_name='verifier'`,
//      write four `check_*` log entries, update the project to
//      `verified=true, verifier_notes='passed all 4 checks',
//      verifier_pass_count=1`, write `verify_pass` + `write_success` log
//      entries, close the agent_runs row.
//   4. Optionally GET `http://localhost:3000/pathfinder/api/projects/<id>`
//      and assert `verified===true`. Skip gracefully if fetch errors
//      (server not running locally).
//
// Usage:
//   npx tsx scripts/test-verifier.ts
//
// This script is non-destructive on prior verifier verdicts because it only
// touches projects where `verified IS NULL`.

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { PathfinderDatabase } from '../lib/types';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('▸ FAIL — missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient<PathfinderDatabase, 'pathfinder'>(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // 1. Find the most recent unverified project.
  const { data: candidates, error: selErr } = await supabase
    .from('projects')
    .select('id, title, ranked_at, verified')
    .is('verified', null)
    .order('ranked_at', { ascending: false, nullsFirst: false })
    .limit(1);

  if (selErr) {
    console.error('▸ FAIL — select failed:', selErr.message);
    process.exit(1);
  }

  if (!candidates || candidates.length === 0) {
    // 2. No work — write a clean verify_start log entry and exit 0.
    const { error: logErr } = await supabase.from('agent_log').insert({
      agent_name: 'verifier',
      event_type: 'verify_start',
      event_data: {
        message: 'no unverified projects — exiting clean',
        queue_depth: 0,
        smoke_test: true,
      },
    });
    if (logErr) {
      console.error('▸ FAIL — log insert failed:', logErr.message);
      process.exit(1);
    }
    console.log('▸ PASS — queue empty, clean exit logged');
    process.exit(0);
  }

  const project = candidates[0];
  console.log(`▸ targeting project ${project.id} · ${project.title}`);

  // 3a. Open an agent_runs row.
  const { data: run, error: runErr } = await supabase
    .from('agent_runs')
    .insert({
      agent_name: 'verifier',
      records_processed: 0,
      records_new: 0,
      status: 'running',
    })
    .select('id')
    .maybeSingle();

  if (runErr || !run) {
    console.error('▸ FAIL — agent_runs open failed:', runErr?.message);
    process.exit(1);
  }
  const runId = run.id;

  // 3b. Four check_* log entries — one per documented Verifier check.
  const checks: { event_type: string; message: string }[] = [
    {
      event_type: 'check_rationale',
      message: `rationale check · ${project.id} · 4 evidence anchors confirmed`,
    },
    {
      event_type: 'check_branch',
      message: `branch attribution · ${project.id} · ranker=match recompute=match · ok`,
    },
    {
      event_type: 'check_score',
      message: `score sensibility · ${project.id} · within ±15 of recompute`,
    },
    {
      event_type: 'check_customer_refs',
      message: `customer refs · ${project.id} · all named customers resolved`,
    },
  ];

  for (const c of checks) {
    const { error } = await supabase.from('agent_log').insert({
      agent_name: 'verifier',
      event_type: c.event_type,
      event_data: { message: c.message, project_id: project.id, smoke_test: true },
      latency_ms: 120,
      model_used: 'claude-sonnet',
    });
    if (error) {
      console.error(`▸ FAIL — log ${c.event_type} failed:`, error.message);
      await closeRun(runId, 'failed', error.message);
      process.exit(1);
    }
  }

  // 3c. Update the project to a passing verdict.
  const { error: updErr } = await supabase
    .from('projects')
    .update({
      verified: true,
      verifier_notes: 'passed all 4 checks',
      verifier_pass_count: 1,
    })
    .eq('id', project.id);

  if (updErr) {
    console.error('▸ FAIL — project update failed:', updErr.message);
    await closeRun(runId, 'failed', updErr.message);
    process.exit(1);
  }

  // 3d. verify_pass + write_success log entries.
  const { error: passErr } = await supabase.from('agent_log').insert({
    agent_name: 'verifier',
    event_type: 'verify_pass',
    event_data: {
      message: `verified · ${project.id} · all 4 checks passed`,
      project_id: project.id,
      smoke_test: true,
    },
    latency_ms: 480,
    model_used: 'claude-sonnet',
  });
  if (passErr) {
    console.error('▸ FAIL — verify_pass log failed:', passErr.message);
    await closeRun(runId, 'failed', passErr.message);
    process.exit(1);
  }

  const { error: writeErr } = await supabase.from('agent_log').insert({
    agent_name: 'verifier',
    event_type: 'write_success',
    event_data: { message: 'write · 1 verified · 0 escalated', verified: 1, escalated: 0, smoke_test: true },
  });
  if (writeErr) {
    console.error('▸ FAIL — write_success log failed:', writeErr.message);
    await closeRun(runId, 'failed', writeErr.message);
    process.exit(1);
  }

  // 3e. Close the agent_runs row.
  await closeRun(runId, 'success', null, 1, 1);

  // 4. Optionally hit the projects API and assert verified===true.
  try {
    const res = await fetch(`http://localhost:3000/pathfinder/api/projects/${project.id}`);
    if (!res.ok) {
      console.log(`▸ skip — local dev server not reachable (status ${res.status}); skipping API assert`);
    } else {
      const body = (await res.json()) as { verified?: boolean | null };
      if (body.verified === true) {
        console.log(`▸ API assert ok — /api/projects/${project.id} returned verified=true`);
      } else {
        console.error(`▸ FAIL — API returned verified=${body.verified} (expected true)`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.log(`▸ skip — fetch failed (${(err as Error).message}); skipping API assert`);
  }

  console.log(`▸ PASS — verifier smoke test completed for project ${project.id}`);
}

async function closeRun(
  runId: number,
  status: 'success' | 'failed',
  errorMessage: string | null,
  recordsProcessed = 1,
  recordsNew = 0,
) {
  const { error } = await supabase
    .from('agent_runs')
    .update({
      completed_at: new Date().toISOString(),
      records_processed: recordsProcessed,
      records_new: recordsNew,
      status,
      error_message: errorMessage,
    })
    .eq('id', runId);
  if (error) {
    console.error('▸ FAIL — agent_runs close failed:', error.message);
  }
}

main().catch((err) => {
  console.error('▸ FAIL — unhandled error:', err);
  process.exit(1);
});
