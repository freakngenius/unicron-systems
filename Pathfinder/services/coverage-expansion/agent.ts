// services/coverage-expansion/agent.ts — Phase 2 Stream E, Gate E2.
//
// Coverage Expansion Agent. Composes Source Onboarder beneath it (per
// SPEC §2 composition diagram). The agent:
//   1. Discovers candidates via registry + (optional) Sonar
//   2. Pre-flight estimate (cost, time, completeness)
//   3. On approval, dispatches Source Onboarder against ranked candidates
//      (max 5 concurrent per spec §11)
//   4. Tracks progress in coverage_goals + coverage_goal_candidates
//   5. Stops on budget / timeout / 5 consecutive non-progress events
//
// This is invoked from the Inngest function `coverage-expansion-run` after
// the operator approves a draft goal.

import { supabaseAdmin } from '@/lib/supabase';
import { runSourceOnboarder } from '../source-onboarder/agent';
import { discoverCandidates } from './tools/discover-candidates';
import { estimateCoverage } from './tools/estimate';
import type {
  CoverageEstimate,
  CoverageGoalRow,
  CoverageRunResult,
  CoverageScopeConstraints,
} from './types';

const MAX_CONCURRENT = 5;            // SPEC §5
const NON_PROGRESS_STOP = 5;         // SPEC §5 step 10
const COMPLETION_LIFT_THRESHOLD = 0.8; // SPEC §5 step 9

type LooseSb = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        order?: (col: string, opts: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      };
    };
    insert: (rows: Record<string, unknown>[]) => {
      select: (cols: string) => {
        single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    } & Promise<{ error: { message: string } | null }>;
    update: (cols: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function sb(): LooseSb {
  return supabaseAdmin() as unknown as LooseSb;
}

// ----- estimate flow ------------------------------------------------------

export async function estimateGoal(args: {
  goalId: string;
  goal: string;
  constraints: CoverageScopeConstraints;
  sessionId: string;
}): Promise<CoverageEstimate> {
  const candidates = await discoverCandidates({
    goal: args.goal,
    constraints: args.constraints,
    sessionId: args.sessionId,
    useSonar: true,
  });
  const estimate = await estimateCoverage({
    goal: args.goal,
    constraints: args.constraints,
    candidates,
    sessionId: args.sessionId,
  });

  await sb().from('coverage_goals').update({
    estimate,
    status: 'draft',
  }).eq('id', args.goalId);

  // Persist candidates as pending rows.
  const rows = estimate.candidates.map((c) => ({
    goal_id: args.goalId,
    candidate_url: c.candidate_url,
    candidate_type: c.candidate_type,
    estimated_impact: c.estimated_impact,
    estimated_tier: c.estimated_tier,
    status: 'pending' as const,
  }));
  if (rows.length > 0) {
    // Use upsert-style — insert ignoring duplicates (unique on goal_id+url).
    try {
      await sb().from('coverage_goal_candidates').insert(rows);
    } catch {
      // duplicates ignored
    }
  }
  return estimate;
}

// ----- run flow -----------------------------------------------------------

export async function runGoal(args: { goalId: string; sessionId: string }): Promise<CoverageRunResult> {
  const startedAt = Date.now();

  const goal = await loadGoal(args.goalId);
  if (!goal) {
    return { goal_id: args.goalId, status: 'failed', total_cost_usd: 0, total_sources_onboarded: 0, total_sources_assist_queued: 0, total_sources_declined: 0, total_estimated_lift: 0, duration_ms: 0, reason: 'goal_not_found' };
  }

  await sb().from('coverage_goals').update({
    status: 'running',
    started_at: new Date().toISOString(),
    agent_session_id: args.sessionId,
  }).eq('id', args.goalId);

  const candidates = await loadPendingCandidates(args.goalId);
  if (candidates.length === 0) {
    await sb().from('coverage_goals').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', args.goalId);
    return { goal_id: args.goalId, status: 'completed', total_cost_usd: 0, total_sources_onboarded: 0, total_sources_assist_queued: 0, total_sources_declined: 0, total_estimated_lift: 0, duration_ms: Date.now() - startedAt, reason: 'no_candidates' };
  }

  // Rank: tier 1 first (highest impact), then tier 2.
  const ranked = [...candidates].sort((a, b) => {
    if (a.estimated_tier !== b.estimated_tier) return a.estimated_tier - b.estimated_tier;
    return (b.estimated_impact ?? 0) - (a.estimated_impact ?? 0);
  });

  const targetLift = (goal.estimate?.estimated_daily_lift ?? 0) * COMPLETION_LIFT_THRESHOLD;
  let totalCost = 0;
  let onboarded = 0;
  let assistQueued = 0;
  let declined = 0;
  let lift = 0;
  let consecutiveNonProgress = 0;

  // Process in batches of MAX_CONCURRENT.
  for (let i = 0; i < ranked.length; i += MAX_CONCURRENT) {
    if (Date.now() - startedAt > goal.timeout_hours * 3600 * 1000) {
      await pauseGoal(args.goalId, 'timeout');
      return finalize({ goalId: args.goalId, status: 'paused', startedAt, totalCost, onboarded, assistQueued, declined, lift, reason: 'timeout' });
    }
    if (totalCost >= goal.budget_usd) {
      await pauseGoal(args.goalId, 'budget_exceeded');
      return finalize({ goalId: args.goalId, status: 'paused', startedAt, totalCost, onboarded, assistQueued, declined, lift, reason: 'budget_exceeded' });
    }
    if (lift >= targetLift && targetLift > 0) {
      break; // 80% of estimated lift captured
    }

    const batch = ranked.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.all(
      batch.map(async (c) => {
        await sb().from('coverage_goal_candidates').update({ status: 'dispatched', dispatched_at: new Date().toISOString() }).eq('id', c.id);
        try {
          const out = await runSourceOnboarder({
            inputs: {
              kind: 'url',
              url: c.candidate_url,
              jurisdiction: undefined,
              created_by_user_email: goal.created_by_user_email ?? undefined,
            },
          });
          return { candidate: c, result: out };
        } catch (e) {
          return { candidate: c, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    let progressedThisBatch = false;
    for (const r of results) {
      const c = r.candidate;
      if ('error' in r) {
        await sb().from('coverage_goal_candidates').update({ status: 'failed', resolved_at: new Date().toISOString(), result_payload: { error: r.error } }).eq('id', c.id);
        consecutiveNonProgress += 1;
        continue;
      }
      const out = r.result!;
      totalCost += out.cost_usd;
      const update: Record<string, unknown> = {
        resolved_at: new Date().toISOString(),
        source_onboarder_session_id: out.session_id,
        result_payload: { outcome: out.outcome, source_id: out.source_id, ticket_id: out.ticket_id, reason: out.reason },
      };
      if (out.outcome === 'live') {
        update.status = 'onboarded';
        update.data_source_id = out.source_id ?? null;
        onboarded += 1;
        lift += c.estimated_impact ?? 0;
        progressedThisBatch = true;
      } else if (out.outcome === 'human-assist') {
        update.status = 'assist_queued';
        assistQueued += 1;
      } else if (out.outcome === 'declined') {
        update.status = 'declined';
        declined += 1;
      } else {
        update.status = 'failed';
      }
      await sb().from('coverage_goal_candidates').update(update).eq('id', c.id);
    }
    if (progressedThisBatch) consecutiveNonProgress = 0;
    else consecutiveNonProgress += batch.length;

    if (consecutiveNonProgress >= NON_PROGRESS_STOP) {
      await pauseGoal(args.goalId, 'non_progress');
      return finalize({ goalId: args.goalId, status: 'paused', startedAt, totalCost, onboarded, assistQueued, declined, lift, reason: 'non_progress' });
    }
  }

  // Done — mark completed.
  await sb().from('coverage_goals').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    total_cost_usd: totalCost,
    total_sources_onboarded: onboarded,
    total_sources_assist_queued: assistQueued,
    total_sources_declined: declined,
    total_estimated_lift: lift,
  }).eq('id', args.goalId);

  return finalize({ goalId: args.goalId, status: 'completed', startedAt, totalCost, onboarded, assistQueued, declined, lift });
}

function finalize(args: {
  goalId: string;
  status: 'completed' | 'paused' | 'failed';
  startedAt: number;
  totalCost: number;
  onboarded: number;
  assistQueued: number;
  declined: number;
  lift: number;
  reason?: string;
}): CoverageRunResult {
  return {
    goal_id: args.goalId,
    status: args.status,
    total_cost_usd: args.totalCost,
    total_sources_onboarded: args.onboarded,
    total_sources_assist_queued: args.assistQueued,
    total_sources_declined: args.declined,
    total_estimated_lift: args.lift,
    duration_ms: Date.now() - args.startedAt,
    reason: args.reason,
  };
}

async function pauseGoal(goalId: string, reason: string): Promise<void> {
  await sb().from('coverage_goals').update({
    status: 'paused',
    completed_at: new Date().toISOString(),
  }).eq('id', goalId);
  void reason;
}

async function loadGoal(id: string): Promise<CoverageGoalRow | null> {
  const result = await sb().from('coverage_goals').select('*').eq('id', id).single();
  if (result.error || !result.data) return null;
  return result.data as unknown as CoverageGoalRow;
}

async function loadPendingCandidates(goalId: string): Promise<{ id: string; candidate_url: string; estimated_tier: 1 | 2 | 3; estimated_impact: number; }[]> {
  const sbAny = sb() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => Promise<{ data: { id: string; candidate_url: string; estimated_tier: 1 | 2 | 3; estimated_impact: number }[] | null; error: unknown }>;
        };
      };
    };
  };
  const result = await sbAny.from('coverage_goal_candidates').select('id,candidate_url,estimated_tier,estimated_impact').eq('goal_id', goalId).eq('status', 'pending');
  return result.data ?? [];
}
