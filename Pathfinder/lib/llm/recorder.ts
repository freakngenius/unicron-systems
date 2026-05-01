// LLM call recorder — Phase 1 G1 Task A2 + G2 Task 3 Axiom hook.
// Writes per-call rows to pathfinder.llm_calls (migration 0014). Also
// fires an Axiom event per call for trace inspection alongside the
// supabase row (env-gated by AXIOM_TOKEN; no-op when unset).
//
// Used by both run() (one-shot) and runStream() (streaming) entry points,
// plus directly by lib/anthropic.ts and lib/chat/sonar.ts streaming wrappers
// that keep their existing public APIs while gaining cost telemetry.
//
// Fire-and-forget pattern: callers do not await record(). Failures log to
// console.error and never bubble up — telemetry must not break the LLM call.
//
// Supabase import is lazy: lib/supabase.ts throws at module-load if
// NEXT_PUBLIC_SUPABASE_URL is unset, which would break test files that
// transitively import the recorder via lib/llm/run.ts. Dynamic import
// pushes the env check to first actual write.

import { logAxiom } from '../observability/axiom';
import type { LLMSurface } from './types';

export interface RecordCallInput {
  model: string;
  surface: LLMSurface;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  costUsd: number;
  latencyMs: number;
  cacheHit?: boolean;
  agentRunId?: number | null;
  agentName?: string | null;
  sessionId?: string | null;
}

export function recordLLMCall(input: RecordCallInput): void {
  void writeRow(input).catch((err) => {
    console.error('[llm.recorder] failed to record llm_call', err);
  });
  // Mirror to Axiom for trace inspection. logAxiom is no-op when AXIOM_TOKEN
  // is unset, so this is free in environments that haven't enabled Axiom yet.
  logAxiom({
    level: 'info',
    surface: 'llm-gateway',
    message: `${input.model} ${input.surface}`,
    model: input.model,
    llm_surface: input.surface,
    agent_run_id: input.agentRunId ?? null,
    agent_name: input.agentName ?? null,
    session_id: input.sessionId ?? null,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cached_input_tokens: input.cachedInputTokens ?? 0,
    cost_usd: input.costUsd,
    latency_ms: input.latencyMs,
    cache_hit: input.cacheHit ?? false,
  });
}

async function writeRow(input: RecordCallInput): Promise<void> {
  // Lazy import: only load lib/supabase.ts on first actual write so test
  // files that transitively pull in this module via lib/llm/run.ts don't
  // explode at module-load when env vars aren't set.
  //
  // **Service role required.** RLS on pathfinder.llm_calls is
  //   policy llm_calls_write: cmd=ALL, roles={service_role}, with_check=true
  //   policy llm_calls_read:  cmd=SELECT, roles={anon, authenticated}, qual=true
  // The anon `supabase` client RLS-rejects every insert silently — the
  // postgrest error returned by .insert() is caught by the outer
  // recordLLMCall fire-and-forget and only console.error'd, so writes
  // appear to succeed (no caller failure) while the table stays empty.
  // This was the actual cause of pathfinder.llm_calls staying at 0 rows
  // through Phase 1 G1 + G2 despite both gateway and wrapped-anthropic()
  // paths firing recordLLMCall. Switch to supabaseAdmin() (service role)
  // so the policy admits the insert.
  const { supabaseAdmin } = await import('../supabase');
  // Loose-typed cast follows the convention in lib/briefing.ts +
  // lib/scoring-config-server.ts: supabase-js generated types collide with
  // pathfinder's hand-written PathfinderDatabase narrowing under
  // PostgrestVersion: 12. The Insert type still validates at the row level
  // when callers go through this function (RecordCallInput is the contract).
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await sb.from('llm_calls').insert({
    model: input.model,
    surface: input.surface,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cached_input_tokens: input.cachedInputTokens ?? 0,
    cost_usd: input.costUsd,
    latency_ms: input.latencyMs,
    cache_hit: input.cacheHit ?? false,
    agent_run_id: input.agentRunId ?? null,
    agent_name: input.agentName ?? null,
    session_id: input.sessionId ?? null,
  });
  if (error) throw new Error(error.message);
}
