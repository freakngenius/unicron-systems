// GET /api/cost-summary
//
// Cumulative model-routing telemetry across the full lifetime of the fleet.
// As of Phase 1 G1 (Task A4), this endpoint serves both the legacy
// agent_log.model_used aggregation AND the new pathfinder.llm_calls
// normalized telemetry. Client-side rendering switches over when ready;
// the legacy read is removed in G2.
//
// Response:
//   {
//     // Legacy (agent_log.model_used counts):
//     model_calls:   { 'claude-sonnet': 92, 'sonar': 19, ... },
//     total_calls:   212,
//     total_ranked:  32,
//
//     // New (pathfinder.llm_calls authoritative):
//     llm_calls: {
//       by_model:    { 'claude-sonnet-4-6': { count: 92, cost_usd: 4.21, ... } },
//       total_count: 117,
//       total_cost_usd: 5.94,
//     }
//   }
//
// TODO: remove `model_calls` / `total_calls` legacy fields after G2.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface LegacyAgentLogRow {
  model_used: string | null;
}

interface LlmCallRow {
  model: string;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cache_hit: boolean | null;
}

export async function GET() {
  // Legacy read: agent_log.model_used
  const callsRes = await supabase
    .from('agent_log')
    .select('model_used')
    .not('model_used', 'is', null)
    .limit(5000);

  // New read: llm_calls — last 5000 rows (≈10 days at current volume)
  const llmRes = await supabase
    .from('llm_calls')
    .select('model, cost_usd, input_tokens, output_tokens, cached_input_tokens, cache_hit')
    .order('created_at', { ascending: false })
    .limit(5000);

  // Total ranked projects (cumulative)
  const rankedRes = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .not('score', 'is', null);

  if (callsRes.error || rankedRes.error || llmRes.error) {
    return NextResponse.json(
      {
        error:
          callsRes.error?.message ??
          rankedRes.error?.message ??
          llmRes.error?.message,
      },
      { status: 500 },
    );
  }

  // Legacy aggregation
  const legacyRows = (callsRes.data ?? []) as LegacyAgentLogRow[];
  const model_calls: Record<string, number> = {};
  for (const r of legacyRows) {
    if (!r.model_used) continue;
    model_calls[r.model_used] = (model_calls[r.model_used] || 0) + 1;
  }
  const total_calls = legacyRows.length;
  const total_ranked = rankedRes.count ?? 0;

  // New aggregation
  const llmRows = (llmRes.data ?? []) as LlmCallRow[];
  const by_model: Record<
    string,
    {
      count: number;
      cost_usd: number;
      input_tokens: number;
      output_tokens: number;
      cached_input_tokens: number;
      cache_hits: number;
    }
  > = {};
  let total_count = 0;
  let total_cost_usd = 0;
  for (const r of llmRows) {
    const m = r.model || 'unknown';
    const slot = by_model[m] ?? {
      count: 0,
      cost_usd: 0,
      input_tokens: 0,
      output_tokens: 0,
      cached_input_tokens: 0,
      cache_hits: 0,
    };
    slot.count += 1;
    slot.cost_usd += Number(r.cost_usd ?? 0);
    slot.input_tokens += r.input_tokens ?? 0;
    slot.output_tokens += r.output_tokens ?? 0;
    slot.cached_input_tokens += r.cached_input_tokens ?? 0;
    if (r.cache_hit) slot.cache_hits += 1;
    by_model[m] = slot;
    total_count += 1;
    total_cost_usd += Number(r.cost_usd ?? 0);
  }
  // Round per-model costs to 4 decimals to keep response payload sane
  for (const m of Object.keys(by_model)) {
    by_model[m].cost_usd = Number(by_model[m].cost_usd.toFixed(4));
  }
  total_cost_usd = Number(total_cost_usd.toFixed(4));

  return NextResponse.json({
    model_calls,
    total_calls,
    total_ranked,
    llm_calls: {
      by_model,
      total_count,
      total_cost_usd,
    },
  });
}
