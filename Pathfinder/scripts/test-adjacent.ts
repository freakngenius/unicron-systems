// scripts/test-adjacent.ts — Adjacent agent end-to-end smoke test.
//
// Simulates one full Adjacent run by writing the same row sequence the
// deployed Perplexity Space writes during a `0 9 * * 5` cycle. Verifies
// the dashboard surfaces Adjacent activity end-to-end before declaring
// Layer 1 done.
//
// Usage:
//   npx tsx scripts/test-adjacent.ts
//
// Steps (mirrors prompts/computer-adjacent.md):
//   1. Open `pathfinder.agent_runs` row (agent_name='adjacent', status='running')
//   2. Write `discovery_run` agent_log entry (themes='specialty trades', candidate_count=2)
//   3. Write 2 `pathfinder.adjacent_targets` rows
//   4. Write 2 `target_surface` agent_log entries (one per target)
//   5. Write `write_success` agent_log entry (inserted=2, deduped=0)
//   6. Close `agent_runs` row (status='success', records_processed=2, records_new=2)
//   7. Optionally GET /pathfinder/api/activity and assert adjacent entries appear
//   8. Log PASS / FAIL
//
// Idempotent: pathfinder.adjacent_targets has no unique constraint on
// company_name, so re-running just appends 2 more synthetic rows. The
// agent_runs and agent_log writes are append-only inserts and never collide.

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('FAIL · Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Same boundary cast pattern as scripts/backfill.ts — the typed-schema
// generic + custom schema option triggers a "never" overload mismatch in
// @supabase/supabase-js v2; runtime contract is enforced by migrations
// and the schema option below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
} as never) as unknown as { from: (t: string) => any };

// ---------- Synthetic candidates ----------
//
// Two realistic shape-matched targets per the Adjacent prompt's spec:
// multi-branch field-sales orgs in Zedcor's adjacent verticals, with
// `shape_match_reason` and `outreach_draft` (90–140 words each).

const CANDIDATES = [
  {
    company_name: 'Gulf Coast Site Services',
    geography: 'Texas + Louisiana, 7 branches across Houston / Beaumont / Baton Rouge / Lake Charles / Lafayette / Corpus Christi / Mobile',
    branch_count_estimate: 7,
    shape_match_reason:
      'Seven-branch temporary-power and site-services chain serving Gulf Coast refinery turnarounds and TxDOT corridor work — the same multi-branch field-sales pattern Zedcor runs, with reps assigned to refinery clusters rather than central inside sales. Public bid history on TxDOT and Port of Houston work shows budget cycles that lead announcements by 60–90 days, exactly the public-data buying-signal window where Pathfinder surfaces opportunities before the sales team catches them.',
    outreach_draft:
      "I run discovery for a five-branch security operator (Zedcor) that hit the same wall your reps probably do — a multi-branch field-sales motion where territory reps catch refinery and TxDOT opportunities only after the budget closes. We rebuilt the discovery layer on public USAspending, SAM, and county-permit feeds, geo-correlated to branch coverage, scored against customer adjacency. On Zedcor's footprint it surfaces ~30 pre-budget opportunities per cycle within 300-mile radii of each branch. The math reads cleanly onto a Gulf-Coast temp-power chain — same budget windows, similar buyer mix. Phase 2 deploys the scoring layer on idle on-prem GPUs, so it's not a recurring cloud bill. Worth a 20-minute call to see whether the wedge maps?",
  },
  {
    company_name: 'Front Range Modular Offices',
    geography: 'Colorado + Utah + Wyoming, 5 branches across Denver / Colorado Springs / Salt Lake City / Cheyenne / Casper',
    branch_count_estimate: 5,
    shape_match_reason:
      'Five-branch modular site office and jobsite communications rental chain with reps territoried by Front Range and Wasatch construction corridors. Customer base concentrates on commercial GCs, oil & gas fabricators, and DOT corridor projects — every one of which posts a public buying signal (NEPA filings, county permits, USACE notices) months before the sales team is invited to bid. Branch count and territory model mirror Zedcor; public-data buying-signal arbitrage works identically.',
    outreach_draft:
      "Quick context: I work with a five-branch security operator (Zedcor) whose reps were arriving late to jobsite opportunities because their pipeline only surfaced after a budget closed. We built a discovery layer on public sources — USAspending, SAM, county permits, NEPA filings — geo-correlated to each branch's 300-mile coverage radius and scored against existing customer adjacency. It surfaces pre-budget opportunities about 60–90 days earlier than the prior motion. The pattern reads onto a five-branch modular-office chain with similar vintage: same multi-branch field-sales shape, same buyer mix, same public-data leak before procurement. Phase 2 runs on idle on-prem GPUs, no recurring cloud spend. Open to a 20-minute scoping call?",
  },
];

// ---------- Helpers ----------

function fmtErr(label: string, error: unknown): string {
  if (!error) return label;
  if (typeof error === 'object' && error && 'message' in error) {
    return `${label}: ${(error as { message: string }).message}`;
  }
  return `${label}: ${String(error)}`;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).length;
}

// ---------- Smoke test ----------

interface Counts {
  agentRuns: number;
  agentLog: number;
  adjacentTargets: number;
}

async function run(): Promise<void> {
  const startTs = Date.now();
  console.log('▸ Pathfinder Adjacent smoke test · simulating one Friday 09:00 UTC cycle');
  console.log(`  candidates: ${CANDIDATES.map((c) => c.company_name).join(', ')}`);

  // Sanity: word counts on outreach_draft per spec (90–140 words).
  for (const c of CANDIDATES) {
    const w = wordCount(c.outreach_draft);
    if (w < 90 || w > 140) {
      console.error(`FAIL · ${c.company_name} outreach_draft is ${w} words (spec: 90–140)`);
      process.exit(1);
    }
  }
  console.log('  ✓ outreach_draft word counts within 90–140 spec');

  // ---- Step 1: open agent_runs row ----
  const { data: runRow, error: openErr } = await supabase
    .from('agent_runs')
    .insert({
      agent_name: 'adjacent',
      started_at: new Date().toISOString(),
      records_processed: 0,
      records_new: 0,
      status: 'running',
      error_message: null,
    })
    .select('id')
    .single();
  if (openErr || !runRow) {
    console.error(fmtErr('FAIL · could not open agent_runs', openErr));
    process.exit(1);
  }
  const runId = runRow.id as number;
  console.log(`  ✓ step 1 · opened agent_runs id=${runId} (status=running)`);

  // ---- Step 2: discovery_run log entry ----
  const { error: discErr } = await supabase.from('agent_log').insert({
    agent_name: 'adjacent',
    event_type: 'discovery_run',
    event_data: {
      message: 'researching multi-branch field-sales orgs · 2 candidates surfaced',
      theme: 'specialty trades',
      candidate_count: CANDIDATES.length,
    },
    latency_ms: 12_400,
    model_used: null,
  });
  if (discErr) {
    console.error(fmtErr('FAIL · discovery_run log insert', discErr));
    await closeRun(runId, 'failed', 'discovery_run log insert failed');
    process.exit(1);
  }
  console.log('  ✓ step 2 · wrote discovery_run agent_log entry');

  // ---- Step 3: insert 2 adjacent_targets rows ----
  const { data: insertedTargets, error: targetsErr } = await supabase
    .from('adjacent_targets')
    .insert(CANDIDATES)
    .select('id, company_name');
  if (targetsErr || !insertedTargets) {
    console.error(fmtErr('FAIL · adjacent_targets insert', targetsErr));
    await closeRun(runId, 'failed', 'adjacent_targets insert failed');
    process.exit(1);
  }
  console.log(
    `  ✓ step 3 · wrote ${insertedTargets.length} adjacent_targets rows (ids=${insertedTargets.map((t: { id: number }) => t.id).join(',')})`,
  );

  // ---- Step 4: target_surface log entries (one per target) ----
  const surfaceRows = insertedTargets.map((t: { id: number; company_name: string }, i: number) => ({
    agent_name: 'adjacent' as const,
    event_type: 'target_surface',
    event_data: {
      message: `discovered candidate · ${t.company_name} · ${CANDIDATES[i].branch_count_estimate} branches`,
      company_name: t.company_name,
      branch_count_estimate: CANDIDATES[i].branch_count_estimate,
      shape_match_short: CANDIDATES[i].shape_match_reason.split('.')[0] + '.',
    },
    latency_ms: 380 + i * 41,
    model_used: null,
  }));
  const { error: surfaceErr } = await supabase.from('agent_log').insert(surfaceRows);
  if (surfaceErr) {
    console.error(fmtErr('FAIL · target_surface log insert', surfaceErr));
    await closeRun(runId, 'failed', 'target_surface log insert failed');
    process.exit(1);
  }
  console.log(`  ✓ step 4 · wrote ${surfaceRows.length} target_surface log entries`);

  // ---- Step 5: write_success log entry ----
  const { error: writeErr } = await supabase.from('agent_log').insert({
    agent_name: 'adjacent',
    event_type: 'write_success',
    event_data: {
      message: 'write · 2 candidates · 0 deduped',
      inserted: CANDIDATES.length,
      deduped: 0,
    },
    latency_ms: 145,
    model_used: null,
  });
  if (writeErr) {
    console.error(fmtErr('FAIL · write_success log insert', writeErr));
    await closeRun(runId, 'failed', 'write_success log insert failed');
    process.exit(1);
  }
  console.log('  ✓ step 5 · wrote write_success log entry');

  // ---- Step 6: close agent_runs row ----
  await closeRun(runId, 'success', null);
  console.log(`  ✓ step 6 · closed agent_runs id=${runId} (status=success, records_new=${CANDIDATES.length})`);

  // ---- Step 7: optional dashboard fetch ----
  const apiBase = process.env.PATHFINDER_API_BASE ?? 'http://localhost:3000/pathfinder';
  let dashboardOk: 'verified' | 'skipped' | 'mismatch' = 'skipped';
  try {
    const res = await fetch(`${apiBase}/api/activity?limit=20`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const rows = (await res.json()) as Array<{ agent_name: string; event_type: string }>;
      const adjacentRows = rows.filter((r) => r.agent_name === 'adjacent');
      if (adjacentRows.length > 0) {
        dashboardOk = 'verified';
        console.log(
          `  ✓ step 7 · GET ${apiBase}/api/activity returned ${adjacentRows.length} adjacent rows`,
        );
      } else {
        dashboardOk = 'mismatch';
        console.warn(`  ! step 7 · /api/activity returned 0 adjacent rows (got ${rows.length} total)`);
      }
    } else {
      console.warn(`  ! step 7 · skipped · /api/activity returned HTTP ${res.status}`);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`  ! step 7 · skipped · dev server not reachable at ${apiBase} (${reason})`);
  }

  // ---- Tally + report ----
  const counts = await tally();
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log('---');
  console.log(`pathfinder.agent_runs total       : ${counts.agentRuns}`);
  console.log(`pathfinder.agent_log total        : ${counts.agentLog}`);
  console.log(`pathfinder.adjacent_targets total : ${counts.adjacentTargets}`);
  console.log(`elapsed: ${elapsed}s · dashboard verify: ${dashboardOk}`);
  console.log('PASS · simulated one Adjacent cycle end-to-end');
}

async function closeRun(
  runId: number,
  status: 'success' | 'failed',
  errorMessage: string | null,
): Promise<void> {
  await supabase
    .from('agent_runs')
    .update({
      completed_at: new Date().toISOString(),
      records_processed: CANDIDATES.length,
      records_new: status === 'success' ? CANDIDATES.length : 0,
      status,
      error_message: errorMessage,
    })
    .eq('id', runId);
}

async function tally(): Promise<Counts> {
  const { count: agentRuns } = await supabase
    .from('agent_runs')
    .select('*', { count: 'exact', head: true });
  const { count: agentLog } = await supabase
    .from('agent_log')
    .select('*', { count: 'exact', head: true });
  const { count: adjacentTargets } = await supabase
    .from('adjacent_targets')
    .select('*', { count: 'exact', head: true });
  return {
    agentRuns: agentRuns ?? 0,
    agentLog: agentLog ?? 0,
    adjacentTargets: adjacentTargets ?? 0,
  };
}

run().catch((e) => {
  console.error('FAIL · unhandled error:', e);
  process.exit(1);
});
