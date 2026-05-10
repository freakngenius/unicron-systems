// Cost-tracking client (Wave 3, Stream W3-G).
//
// Aggregates LLM spend across two sources:
//   - pathfinder.llm_calls       (per-call telemetry — model, tokens, cost)
//   - unicron.agent_dispatches   (per-dispatch cost — operator-attributed)
//
// Schema reference:
//   - Pathfinder/supabase/migrations/0014_llm_calls.sql
//       (id, agent_run_id, agent_name, session_id, surface, model,
//        input_tokens, output_tokens, cached_input_tokens, cost_usd,
//        latency_ms, cache_hit, created_at)
//   - Pathfinder/supabase/migrations/0112_lead_contacts.sql
//       (additive: provider text)
//   - unicron-platform/supabase/migrations/0001_agent_console.sql
//       (id, agent_name, customer_org_id, status, cost_usd, duration_ms,
//        created_at, ...)
//
// pathfinder.llm_calls intentionally has no customer_org_id column today —
// per-customer attribution is sourced from unicron.agent_dispatches only.
// Per-agent / per-model / time-series data come from llm_calls.

import { getSupabase } from './supabase';

export type CostWindow = 'today' | '7d' | '30d' | 'all';

export type LlmCallRow = {
  id: string;
  agent_name: string | null;
  model: string;
  provider: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
};

export type DispatchCostRow = {
  id: string;
  agent_name: string;
  customer_org_id: string;
  cost_usd: number | null;
  created_at: string;
};

export type CostBucket = {
  /** YYYY-MM-DD UTC for daily bins; or 'all' when no date axis applies. */
  bucket: string;
  cost_usd: number;
  call_count: number;
};

export type CostBreakdown = {
  /** Display label (agent name, customer id, model, or provider). */
  key: string;
  cost_usd: number;
  call_count: number;
  /** Sum of input + output tokens (llm_calls only). 0 for dispatch-derived rows. */
  total_tokens: number;
};

export type CostSummary = {
  window: CostWindow;
  /** Total $ spend across both sources. */
  total_cost_usd: number;
  /** Sum of llm_calls rows in window. */
  llm_call_count: number;
  /** Sum of agent_dispatches rows with non-null cost_usd in window. */
  dispatch_count: number;
  /** Sum of input + output tokens for llm_calls. */
  total_tokens: number;
  by_agent: CostBreakdown[];
  by_customer: CostBreakdown[];
  by_model: CostBreakdown[];
  by_provider: CostBreakdown[];
  /** Daily buckets, oldest → newest. */
  daily: CostBucket[];
};

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

export function windowStart(win: CostWindow, now = new Date()): Date | null {
  const ms = now.getTime();
  switch (win) {
    case 'today': {
      const d = new Date(ms);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case '7d':
      return new Date(ms - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(ms - 30 * 24 * 60 * 60 * 1000);
    case 'all':
      return null;
  }
}

export function windowDays(win: CostWindow): number {
  switch (win) {
    case 'today':
      return 1;
    case '7d':
      return 7;
    case '30d':
      return 30;
    case 'all':
      return 30;
  }
}

// ---------------------------------------------------------------------------
// Aggregation primitives (pure — exported for unit tests)
// ---------------------------------------------------------------------------

function bumpBreakdown(
  map: Map<string, CostBreakdown>,
  key: string,
  cost: number,
  tokens: number,
) {
  const existing = map.get(key);
  if (existing) {
    existing.cost_usd += cost;
    existing.call_count += 1;
    existing.total_tokens += tokens;
  } else {
    map.set(key, { key, cost_usd: cost, call_count: 1, total_tokens: tokens });
  }
}

function sortBreakdown(map: Map<string, CostBreakdown>): CostBreakdown[] {
  return [...map.values()].sort((a, b) => b.cost_usd - a.cost_usd);
}

/** Infer provider for legacy llm_calls rows where provider is null. */
export function inferProvider(model: string, provider: string | null): string {
  if (provider && provider.length > 0) return provider;
  const m = model.toLowerCase();
  if (m.includes('claude') || m.includes('anthropic')) return 'anthropic';
  if (m.includes('gpt') || m.includes('openai') || m.startsWith('o1') || m.startsWith('o3')) {
    return 'openai';
  }
  if (m.includes('sonar') || m.includes('perplexity') || m.includes('pplx')) {
    return 'perplexity';
  }
  if (m.includes('gemini')) return 'google';
  if (m.includes('grok')) return 'xai';
  return 'unknown';
}

/** Convert a Date to a YYYY-MM-DD UTC bucket key. */
export function dayBucketKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build N consecutive UTC daily bucket keys ending today (oldest → newest).
 * Used to seed the daily array so the chart shows zero-volume gaps.
 */
export function buildDayBuckets(days: number, now = new Date()): string[] {
  const keys: string[] = [];
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(dayBucketKey(d));
  }
  return keys;
}

/**
 * Aggregate llm_calls + agent_dispatches rows into a CostSummary.
 *
 * Notes:
 *   - llm_calls cost contributes to by_agent / by_model / by_provider / daily.
 *   - dispatches cost contributes to by_customer / daily (and by_agent
 *     additively when no llm_calls row already accounted for it; in
 *     practice the dispatch.cost_usd is a rolled-up total that may overlap
 *     with llm_calls. We choose by_agent from llm_calls only to avoid
 *     double-counting; by_customer comes from dispatches only).
 *   - Daily buckets sum BOTH sources to give the operator a single trend
 *     line; this errs on the side of over-counting overlap rather than
 *     undercounting, and matches how operators read "spend per day" today.
 */
export function aggregate(
  win: CostWindow,
  llmCalls: LlmCallRow[],
  dispatches: DispatchCostRow[],
  now = new Date(),
): CostSummary {
  const byAgent = new Map<string, CostBreakdown>();
  const byCustomer = new Map<string, CostBreakdown>();
  const byModel = new Map<string, CostBreakdown>();
  const byProvider = new Map<string, CostBreakdown>();
  const daily = new Map<string, CostBucket>();

  for (const k of buildDayBuckets(windowDays(win), now)) {
    daily.set(k, { bucket: k, cost_usd: 0, call_count: 0 });
  }

  let totalCost = 0;
  let totalTokens = 0;

  for (const row of llmCalls) {
    const cost = Number(row.cost_usd ?? 0);
    const tokens = Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0);
    totalCost += cost;
    totalTokens += tokens;

    bumpBreakdown(byAgent, row.agent_name ?? '(unknown)', cost, tokens);
    bumpBreakdown(byModel, row.model, cost, tokens);
    bumpBreakdown(byProvider, inferProvider(row.model, row.provider), cost, tokens);

    const bucketKey = row.created_at.slice(0, 10);
    const bucket = daily.get(bucketKey);
    if (bucket) {
      bucket.cost_usd += cost;
      bucket.call_count += 1;
    }
  }

  for (const row of dispatches) {
    const cost = Number(row.cost_usd ?? 0);
    if (cost === 0) continue;
    totalCost += cost;
    bumpBreakdown(byCustomer, row.customer_org_id, cost, 0);

    const bucketKey = row.created_at.slice(0, 10);
    const bucket = daily.get(bucketKey);
    if (bucket) {
      bucket.cost_usd += cost;
      bucket.call_count += 1;
    }
  }

  const dailyOrdered = [...daily.values()].sort((a, b) =>
    a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0,
  );

  return {
    window: win,
    total_cost_usd: totalCost,
    llm_call_count: llmCalls.length,
    dispatch_count: dispatches.filter((d) => Number(d.cost_usd ?? 0) > 0).length,
    total_tokens: totalTokens,
    by_agent: sortBreakdown(byAgent),
    by_customer: sortBreakdown(byCustomer),
    by_model: sortBreakdown(byModel),
    by_provider: sortBreakdown(byProvider),
    daily: dailyOrdered,
  };
}

// ---------------------------------------------------------------------------
// Mock fixture (used when VITE_PATHFINDER_DB_ENABLED !== 'true')
// ---------------------------------------------------------------------------

function realEnabled(): boolean {
  return import.meta.env.VITE_PATHFINDER_DB_ENABLED === 'true';
}

function mockData(now = new Date()): { llm: LlmCallRow[]; dispatches: DispatchCostRow[] } {
  // Spread synthetic rows across the trailing 7 days so the default window
  // shows non-empty charts without a live DB.
  const llm: LlmCallRow[] = [];
  const dispatches: DispatchCostRow[] = [];
  const baseAgents = ['ranker', 'qualifier', 'enricher', 'briefer', 'architect'];
  const models: { model: string; provider: string | null; input: number; output: number; cost: number }[] = [
    { model: 'claude-opus-4-5', provider: 'anthropic', input: 12000, output: 1800, cost: 0.36 },
    { model: 'claude-sonnet-4-5', provider: 'anthropic', input: 8000, output: 1200, cost: 0.06 },
    { model: 'gpt-4o', provider: 'openai', input: 6000, output: 900, cost: 0.04 },
    { model: 'sonar-pro', provider: 'perplexity', input: 4000, output: 700, cost: 0.02 },
    { model: 'claude-haiku-4-5', provider: 'anthropic', input: 3000, output: 500, cost: 0.005 },
  ];

  let id = 0;
  for (let day = 6; day >= 0; day--) {
    const ts = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 6; i++) {
      const m = models[(day + i) % models.length];
      const a = baseAgents[(day * 2 + i) % baseAgents.length];
      llm.push({
        id: `mock-llm-${++id}`,
        agent_name: a,
        model: m.model,
        provider: m.provider,
        input_tokens: m.input,
        output_tokens: m.output,
        cached_input_tokens: 0,
        cost_usd: m.cost * (1 + (i % 3) * 0.25),
        created_at: ts.toISOString(),
      });
    }
    dispatches.push({
      id: `mock-disp-${day}-zedcor`,
      agent_name: 'qualifier',
      customer_org_id: 'zedcor',
      cost_usd: 0.32 + day * 0.04,
      created_at: ts.toISOString(),
    });
    if (day < 4) {
      dispatches.push({
        id: `mock-disp-${day}-acme`,
        agent_name: 'briefer',
        customer_org_id: 'acme-pilot',
        cost_usd: 0.18 + day * 0.02,
        created_at: ts.toISOString(),
      });
    }
  }

  return { llm, dispatches };
}

// ---------------------------------------------------------------------------
// Network fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch + aggregate cost data for the requested window.
 *
 * RLS: pathfinder.llm_calls allows anon SELECT (0014_llm_calls.sql); since
 * unicron.agent_dispatches policy `agent_dispatches_authenticated` requires
 * an authenticated session (0001_agent_console.sql), the dispatch query may
 * return zero rows pre-auth — we tolerate that by treating it as empty.
 */
export async function loadCostSummary(
  win: CostWindow,
  now = new Date(),
): Promise<CostSummary> {
  if (!realEnabled()) {
    await new Promise((r) => setTimeout(r, 80));
    const { llm, dispatches } = mockData(now);
    return aggregate(win, llm, dispatches, now);
  }

  const supabase = getSupabase();
  const start = windowStart(win, now);

  const llmQuery = supabase
    .schema('pathfinder')
    .from('llm_calls')
    .select(
      'id, agent_name, model, provider, input_tokens, output_tokens, cached_input_tokens, cost_usd, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(5000);
  if (start) llmQuery.gte('created_at', start.toISOString());

  const dispatchQuery = supabase
    .schema('unicron')
    .from('agent_dispatches')
    .select('id, agent_name, customer_org_id, cost_usd, created_at')
    .not('cost_usd', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (start) dispatchQuery.gte('created_at', start.toISOString());

  const [llmRes, dispatchRes] = await Promise.all([llmQuery, dispatchQuery]);
  if (llmRes.error) throw llmRes.error;
  // dispatch RLS may block anon — degrade to empty rather than throw.
  const dispatchRows: DispatchCostRow[] = dispatchRes.error
    ? []
    : ((dispatchRes.data ?? []) as DispatchCostRow[]);
  const llmRows = (llmRes.data ?? []) as LlmCallRow[];

  return aggregate(win, llmRows, dispatchRows, now);
}
