// scripts/dispatch-coverage-estimate.ts
//
// Pre-Tuesday-demo Coverage Expansion estimate dispatcher.
//
// Why this exists: the coverage-estimate flow is normally driven by Inngest
// (event `pathfinder/coverage.estimate.requested` → `coverage-expansion-estimate`
// function). For the 2026-05-04 demo-prep run, INNGEST_EVENT_KEY is not loaded
// in `.env.local` or `.env.production.local`, so we cannot dispatch via the
// canonical event path. This script invokes `estimateGoal` directly, mirroring
// the Inngest function's session-create → estimate → finalize pattern.
//
// Side effects (per goal):
//   - architect_sessions: 1 row (status running → succeeded/failed)
//   - coverage_goals: estimate jsonb populated, status set to 'draft'
//   - coverage_goal_candidates: N pending rows (one per discovered candidate)
// No data_sources writes. No Source Onboarder dispatch.
//
// Usage:
//   pnpm tsx scripts/dispatch-coverage-estimate.ts <goal_id> [<goal_id> ...]

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { estimateGoal } from '../services/coverage-expansion/agent';
import { createSession, finalizeSession } from '../services/source-onboarder/session';
import type { CoverageEstimate, CoverageScopeConstraints } from '../services/coverage-expansion/types';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.PERPLEXITY_API_KEY) {
  console.warn('[warn] PERPLEXITY_API_KEY not set; Sonar discovery will be skipped (registry-only candidates).');
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[warn] ANTHROPIC_API_KEY not set; estimate scoring may fail.');
}

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

interface GoalRow {
  id: string;
  goal_text: string;
  scope_constraints: CoverageScopeConstraints | null;
  created_by_user_email: string | null;
}

async function loadGoal(id: string): Promise<GoalRow | null> {
  const { data, error } = await supabase
    .from('coverage_goals')
    .select('id, goal_text, scope_constraints, created_by_user_email')
    .eq('id', id)
    .single();
  if (error) {
    console.error(`[${id}] load failed: ${error.message}`);
    return null;
  }
  return data as unknown as GoalRow;
}

async function dispatchOne(goalId: string): Promise<{ ok: true; estimate: CoverageEstimate } | { ok: false; error: string }> {
  const goal = await loadGoal(goalId);
  if (!goal) return { ok: false, error: 'goal_not_found' };

  console.log(`[${goalId}] geography=${JSON.stringify(goal.scope_constraints?.geography)} max_sources=${goal.scope_constraints?.max_sources}`);

  const session = await createSession({
    goal: `coverage-estimate: ${goal.goal_text}`,
    input: { goal_id: goalId, dispatched_via: 'scripts/dispatch-coverage-estimate.ts' },
    agentRole: 'coverage-expansion',
    createdByUserEmail: goal.created_by_user_email ?? null,
    trigger: 'manual',
  });
  console.log(`[${goalId}] session=${session.id} starting estimate...`);

  try {
    const estimate = await estimateGoal({
      goalId,
      goal: goal.goal_text,
      constraints: goal.scope_constraints ?? {},
      sessionId: session.id,
    });
    await finalizeSession({ session, status: 'succeeded', outcome: { estimate } });
    console.log(`[${goalId}] OK candidates=${estimate.candidates.length} daily_lift=${estimate.estimated_daily_lift} cost_est=$${estimate.estimated_total_cost_usd.toFixed(2)}`);
    return { ok: true, estimate };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finalizeSession({ session, status: 'failed', outcome: { error: msg } });
    console.error(`[${goalId}] FAILED: ${msg}`);
    return { ok: false, error: msg };
  }
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('Usage: pnpm tsx scripts/dispatch-coverage-estimate.ts <goal_id> [<goal_id> ...]');
    process.exit(1);
  }
  console.log(`Dispatching estimate for ${ids.length} goal(s) sequentially...`);
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    const r = await dispatchOne(id);
    if (r.ok) ok++;
    else failed++;
  }
  console.log('---');
  console.log(`Done. ok=${ok} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
