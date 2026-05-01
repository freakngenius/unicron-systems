// services/source-onboarder/session.ts
//
// Persistent session row + reasoning_log writer. Each Source Onboarder run
// gets a single architect_sessions row. Steps are appended to reasoning_log
// jsonb so the operator UI can stream them.

import { supabaseAdmin } from '@/lib/supabase';
import type { OnboarderSession, ReasoningStep } from './types';

export async function createSession(args: {
  goal: string;
  input: Record<string, unknown>;
  agentRole: 'source-onboarder' | 'coverage-expansion';
  createdByUserEmail?: string | null;
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
    };
  };
  await sb
    .from('architect_sessions')
    .update({
      status: args.status,
      reasoning_log: args.session.steps,
      outcome: args.outcome,
      total_cost_usd: args.session.costUsd,
      total_llm_calls: args.session.llmCalls,
      total_tool_calls: args.session.toolCalls,
      completed_at: new Date().toISOString(),
    })
    .eq('id', args.session.id);
}
