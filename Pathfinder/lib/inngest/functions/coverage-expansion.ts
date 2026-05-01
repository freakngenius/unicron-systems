// lib/inngest/functions/coverage-expansion.ts — Phase 2 Stream E, Gate E2.
//
// Two functions:
//   coverage-expansion-estimate: subscribes pathfinder/coverage.estimate.requested,
//     runs the pre-flight pass, writes coverage_goals.estimate.
//   coverage-expansion-run: subscribes pathfinder/coverage.run.requested, runs
//     the dispatch loop, composes Source Onboarder per spec §2.

import { inngest } from '../client';
import { estimateGoal, runGoal } from '@/services/coverage-expansion/agent';
import { supabaseAdmin } from '@/lib/supabase';
import { createSession, finalizeSession } from '@/services/source-onboarder/session';

interface EstimateEvent { data: { goal_id: string } }
interface RunEvent { data: { goal_id: string } }

export const coverageExpansionEstimate = inngest.createFunction(
  {
    id: 'pathfinder-coverage-expansion-estimate',
    name: 'Coverage Expansion — pre-flight estimate',
    retries: 1,
    triggers: [{ event: 'pathfinder/coverage.estimate.requested' }],
  },
  async ({ event, step }: { event: EstimateEvent; step: unknown }) => {
    const stepCtx = step as { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> };
    return stepCtx.run('estimate', async () => {
      const goal = await loadGoalText(event.data.goal_id);
      if (!goal) return { ok: false, reason: 'goal_not_found' };
      const session = await createSession({
        goal: `coverage-estimate: ${goal.goal_text}`,
        input: { goal_id: event.data.goal_id },
        agentRole: 'coverage-expansion',
        createdByUserEmail: goal.created_by_user_email ?? null,
      });
      try {
        const estimate = await estimateGoal({
          goalId: event.data.goal_id,
          goal: goal.goal_text,
          constraints: goal.scope_constraints ?? {},
          sessionId: session.id,
        });
        await finalizeSession({ session, status: 'succeeded', outcome: { estimate } });
        return { ok: true, estimate };
      } catch (e) {
        await finalizeSession({ session, status: 'failed', outcome: { error: e instanceof Error ? e.message : String(e) } });
        return { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
    });
  },
);

export const coverageExpansionRun = inngest.createFunction(
  {
    id: 'pathfinder-coverage-expansion-run',
    name: 'Coverage Expansion — dispatch loop',
    retries: 0,
    concurrency: { limit: 2 },          // at most 2 goals running concurrently
    triggers: [{ event: 'pathfinder/coverage.run.requested' }],
  },
  async ({ event, step }: { event: RunEvent; step: unknown }) => {
    const stepCtx = step as { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> };
    return stepCtx.run('run', async () => {
      const goal = await loadGoalText(event.data.goal_id);
      if (!goal) return { ok: false, reason: 'goal_not_found' };
      const session = await createSession({
        goal: `coverage-run: ${goal.goal_text}`,
        input: { goal_id: event.data.goal_id },
        agentRole: 'coverage-expansion',
        createdByUserEmail: goal.created_by_user_email ?? null,
      });
      try {
        const result = await runGoal({ goalId: event.data.goal_id, sessionId: session.id });
        await finalizeSession({ session, status: result.status === 'completed' ? 'succeeded' : 'failed', outcome: result as unknown as Record<string, unknown> });
        return result;
      } catch (e) {
        await finalizeSession({ session, status: 'failed', outcome: { error: e instanceof Error ? e.message : String(e) } });
        return { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
    });
  },
);

interface GoalText {
  goal_text: string;
  scope_constraints?: Record<string, unknown>;
  created_by_user_email?: string | null;
}

async function loadGoalText(id: string): Promise<GoalText | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          single: () => Promise<{ data: GoalText | null; error: unknown }>;
        };
      };
    };
  };
  const result = await sb.from('coverage_goals').select('goal_text,scope_constraints,created_by_user_email').eq('id', id).single();
  return result.data ?? null;
}
