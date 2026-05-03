// services/source-onboarder/session.ts
//
// Persistent session row + reasoning_log writer. Each Source Onboarder run
// gets a single architect_sessions row. Steps are appended to reasoning_log
// jsonb so the operator UI can stream them.
//
// Coexistence with Stream D (architect_sessions migration 0070):
//   Stream D's columns session_type, trigger, input_payload are NOT NULL.
//   Stream E populates them with values that match Stream D's CHECK
//   constraints — session_type='discovery' (closest semantic match: Stream E
//   discovers data sources), trigger='operator_action' by default
//   (overridable for cron/inngest dispatch), and input_payload mirrors the
//   Stream-E-native `input` jsonb. agent_role disambiguates onboarder vs
//   coverage-expansion at the row level. Migration 0082 widens the status
//   CHECK to accept Stream E's vocabulary.

import { supabaseAdmin } from '@/lib/supabase';
import type { OnboarderSession, ReasoningStep } from './types';

// Stream D vocabulary — must match values allowed by 0070's CHECK constraints.
// session_type CHECK: ('decomposition','tuning','discovery')
// trigger CHECK:      ('manual','cron','adjacency_threshold','operator_action','periodic')
const STREAM_D_SESSION_TYPE = 'discovery' as const;
type StreamDTrigger = 'manual' | 'cron' | 'adjacency_threshold' | 'operator_action' | 'periodic';

export async function createSession(args: {
  goal: string;
  input: Record<string, unknown>;
  agentRole: 'source-onboarder' | 'coverage-expansion';
  createdByUserEmail?: string | null;
  /** Maps to Stream D's `trigger` column. Default 'operator_action'. */
  trigger?: StreamDTrigger;
}): Promise<OnboarderSession> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>[]) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const result = await sb
    .from('architect_sessions')
    .insert([
      {
        // Stream D required columns (NOT NULL, CHECK-constrained).
        session_type: STREAM_D_SESSION_TYPE,
        trigger: args.trigger ?? 'operator_action',
        input_payload: args.input,
        // Stream E additive columns (added by migration 0082).
        agent_role: args.agentRole,
        goal: args.goal,
        input: args.input,
        status: 'running',
        reasoning_log: [],
        created_by_user_email: args.createdByUserEmail ?? null,
      },
    ])
    .select('id')
    .single();
  if (result.error || !result.data) {
    throw new Error(`architect_sessions insert failed: ${result.error?.message ?? 'no row returned'}`);
  }
  const id = result.data.id;
  const steps: ReasoningStep[] = [];
  return {
    id,
    startedAt: Date.now(),
    steps,
    costUsd: 0,
    llmCalls: 0,
    toolCalls: 0,
    log(step) {
      const full: ReasoningStep = { ...step, timestamp: new Date().toISOString() };
      steps.push(full);
    },
  };
}

export async function finalizeSession(args: {
  session: OnboarderSession;
  status: 'succeeded' | 'failed' | 'needs_assist' | 'timed_out';
  outcome: Record<string, unknown>;
}): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (cols: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{
          data: Array<{ cost_usd: number | null }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  // Post-demo Gate 4 fix: total_cost_usd + total_llm_calls were always
  // landing as 0 because nothing was incrementing the in-memory
  // session.costUsd / session.llmCalls counters between createSession
  // and finalizeSession. Calls go through lib/llm/run.ts → recorder.ts
  // and write to pathfinder.llm_calls (with session_id set), but the
  // session struct never sees them.
  //
  // Fix: aggregate from llm_calls keyed by session_id at finalize time.
  // Falls back to the in-memory tally only when the recorder write is
  // unavailable (test mode without a Supabase admin client).
  let aggregatedCostUsd: number = args.session.costUsd;
  let aggregatedLlmCalls: number = args.session.llmCalls;
  try {
    const callsRes = await sb
      .from('llm_calls')
      .select('cost_usd')
      .eq('session_id', args.session.id);
    if (!callsRes.error && callsRes.data) {
      aggregatedLlmCalls = Math.max(args.session.llmCalls, callsRes.data.length);
      const dbCost = callsRes.data.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
      aggregatedCostUsd = Math.max(args.session.costUsd, dbCost);
    }
  } catch {
    // Telemetry-aggregation failures must not break finalize; fall
    // through to the in-memory tally.
  }

  await sb
    .from('architect_sessions')
    .update({
      status: args.status,
      reasoning_log: args.session.steps,
      outcome: args.outcome,
      total_cost_usd: aggregatedCostUsd,
      total_llm_calls: aggregatedLlmCalls,
      total_tool_calls: args.session.toolCalls,
      completed_at: new Date().toISOString(),
    })
    .eq('id', args.session.id);
}
