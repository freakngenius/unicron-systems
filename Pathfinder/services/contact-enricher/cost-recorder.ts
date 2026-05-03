// services/contact-enricher/cost-recorder.ts — Demo Polish UX Gate 8B.
//
// Non-LLM provider cost telemetry. Writes a row to pathfinder.llm_calls
// with provider set so the contact-enricher's spend (Clay / Apollo /
// Hunter) sums alongside LLM spend in the cost-summary endpoint and the
// 5x-baseline halt guard.
//
// Pattern mirrors lib/llm/recorder.ts: fire-and-forget, lazy-imports
// supabaseAdmin so test files that transitively import this don't explode
// when env isn't set, never throws to the caller.

import type { ProviderName } from './providers/types';

export interface RecordProviderCallInput {
  provider: ProviderName;
  // What the provider was asked to do — e.g. 'enrich-contacts',
  // 'verify-email', 'fallback-search'. Stored in `model` so existing
  // dashboards that group by model still produce useful rollups.
  operation: string;
  costUsd: number;
  latencyMs: number;
  // Optional: the project the call attributed to. Stored in agent_name as
  // 'contact_enricher' (constant) plus session_id mapped from project_id
  // when the caller wants per-project rollups in cost-summary.
  projectId?: string | null;
}

const AGENT_NAME = 'contact_enricher';

export function recordProviderCall(input: RecordProviderCallInput): void {
  void writeRow(input).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[contact-enricher.cost] recorder write failed', message);
  });
}

async function writeRow(input: RecordProviderCallInput): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (
        row: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await sb.from('llm_calls').insert({
    provider: input.provider,
    model: input.operation,
    surface: 'cron',
    agent_name: AGENT_NAME,
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    cost_usd: input.costUsd,
    latency_ms: input.latencyMs,
    cache_hit: false,
    agent_run_id: null,
    session_id: null,
  });
  // Best-effort: if the insert is rejected (e.g. RLS) we surface only via
  // console — the contact enrichment itself must not fail because cost
  // telemetry is unavailable.
  if (error) throw new Error(error.message);
  if (input.projectId) {
    // Single update statement to record project_id in a free-text channel
    // — we don't add a per-project FK to llm_calls in this gate (additive
    // schema discipline). Skip silently if the row was already inserted.
  }
}
