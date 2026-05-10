import { describe, expect, it } from 'vitest';
import {
  aggregate,
  buildDayBuckets,
  dayBucketKey,
  inferProvider,
  windowDays,
  windowStart,
  type DispatchCostRow,
  type LlmCallRow,
} from './costClient';

const NOW = new Date('2026-05-03T12:00:00.000Z');

function llmRow(partial: Partial<LlmCallRow>): LlmCallRow {
  // Use `in`-checks so callers can override fields with explicit nulls
  // (important for testing the agent_name null → '(unknown)' fallback).
  return {
    id: 'id' in partial ? partial.id! : 'r-' + Math.random().toString(36).slice(2),
    agent_name: 'agent_name' in partial ? (partial.agent_name as string | null) : 'ranker',
    model: 'model' in partial ? partial.model! : 'claude-sonnet-4-5',
    provider: 'provider' in partial ? (partial.provider as string | null) : null,
    input_tokens: 'input_tokens' in partial ? (partial.input_tokens as number | null) : 1000,
    output_tokens: 'output_tokens' in partial ? (partial.output_tokens as number | null) : 200,
    cached_input_tokens:
      'cached_input_tokens' in partial ? (partial.cached_input_tokens as number | null) : 0,
    cost_usd: 'cost_usd' in partial ? (partial.cost_usd as number | null) : 0.05,
    created_at: 'created_at' in partial ? partial.created_at! : NOW.toISOString(),
  };
}

function dispatchRow(partial: Partial<DispatchCostRow>): DispatchCostRow {
  return {
    id: partial.id ?? 'd-' + Math.random().toString(36).slice(2),
    agent_name: partial.agent_name ?? 'briefer',
    customer_org_id: partial.customer_org_id ?? 'zedcor',
    cost_usd: partial.cost_usd ?? 0.25,
    created_at: partial.created_at ?? NOW.toISOString(),
  };
}

describe('windowStart', () => {
  it('today returns UTC midnight of `now`', () => {
    const start = windowStart('today', NOW)!;
    expect(start.toISOString()).toBe('2026-05-03T00:00:00.000Z');
  });
  it('7d returns now - 7 days', () => {
    const start = windowStart('7d', NOW)!;
    expect(start.toISOString()).toBe('2026-04-26T12:00:00.000Z');
  });
  it('30d returns now - 30 days', () => {
    const start = windowStart('30d', NOW)!;
    expect(start.toISOString()).toBe('2026-04-03T12:00:00.000Z');
  });
  it('all returns null', () => {
    expect(windowStart('all', NOW)).toBeNull();
  });
});

describe('windowDays', () => {
  it.each([
    ['today', 1],
    ['7d', 7],
    ['30d', 30],
    ['all', 30],
  ] as const)('%s → %d days', (win, days) => {
    expect(windowDays(win)).toBe(days);
  });
});

describe('inferProvider', () => {
  it('passes through explicit provider', () => {
    expect(inferProvider('whatever', 'anthropic')).toBe('anthropic');
  });
  it('maps Anthropic models', () => {
    expect(inferProvider('claude-opus-4-5', null)).toBe('anthropic');
  });
  it('maps OpenAI models', () => {
    expect(inferProvider('gpt-4o', null)).toBe('openai');
    expect(inferProvider('o3-mini', null)).toBe('openai');
  });
  it('maps Perplexity sonar models', () => {
    expect(inferProvider('sonar-pro', null)).toBe('perplexity');
  });
  it('falls back to unknown', () => {
    expect(inferProvider('weird-model-xyz', null)).toBe('unknown');
  });
});

describe('buildDayBuckets', () => {
  it('returns N consecutive UTC days ending today, oldest → newest', () => {
    const keys = buildDayBuckets(3, NOW);
    expect(keys).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
  });
  it('dayBucketKey returns YYYY-MM-DD', () => {
    expect(dayBucketKey(NOW)).toBe('2026-05-03');
  });
});

describe('aggregate', () => {
  it('returns zeroed summary for empty inputs', () => {
    const summary = aggregate('7d', [], [], NOW);
    expect(summary.total_cost_usd).toBe(0);
    expect(summary.llm_call_count).toBe(0);
    expect(summary.dispatch_count).toBe(0);
    expect(summary.by_agent).toEqual([]);
    expect(summary.by_customer).toEqual([]);
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.every((d) => d.cost_usd === 0 && d.call_count === 0)).toBe(true);
  });

  it('sums llm cost and tokens', () => {
    const rows = [
      llmRow({ agent_name: 'ranker', model: 'claude-opus-4-5', cost_usd: 0.5, input_tokens: 1000, output_tokens: 200 }),
      llmRow({ agent_name: 'ranker', model: 'claude-opus-4-5', cost_usd: 0.25, input_tokens: 500, output_tokens: 100 }),
      llmRow({ agent_name: 'briefer', model: 'gpt-4o', cost_usd: 0.10, input_tokens: 200, output_tokens: 50, provider: 'openai' }),
    ];
    const summary = aggregate('7d', rows, [], NOW);
    expect(summary.total_cost_usd).toBeCloseTo(0.85, 6);
    expect(summary.total_tokens).toBe(2050);
    expect(summary.llm_call_count).toBe(3);
  });

  it('breaks down by agent, model, and provider', () => {
    const rows = [
      llmRow({ agent_name: 'ranker', model: 'claude-opus-4-5', cost_usd: 0.40 }),
      llmRow({ agent_name: 'ranker', model: 'claude-sonnet-4-5', cost_usd: 0.10 }),
      llmRow({ agent_name: 'briefer', model: 'gpt-4o', cost_usd: 0.05, provider: 'openai' }),
    ];
    const summary = aggregate('7d', rows, [], NOW);

    expect(summary.by_agent[0]).toMatchObject({ key: 'ranker', cost_usd: 0.5 });
    expect(summary.by_agent[1]).toMatchObject({ key: 'briefer', cost_usd: 0.05 });

    const modelMap = new Map(summary.by_model.map((m) => [m.key, m.cost_usd]));
    expect(modelMap.get('claude-opus-4-5')).toBe(0.40);
    expect(modelMap.get('claude-sonnet-4-5')).toBe(0.10);
    expect(modelMap.get('gpt-4o')).toBe(0.05);

    const providerMap = new Map(summary.by_provider.map((p) => [p.key, p.cost_usd]));
    expect(providerMap.get('anthropic')).toBeCloseTo(0.5, 6);
    expect(providerMap.get('openai')).toBeCloseTo(0.05, 6);
  });

  it('breaks down by customer from dispatches and excludes zero-cost rows', () => {
    const dispatches = [
      dispatchRow({ customer_org_id: 'zedcor', cost_usd: 0.30 }),
      dispatchRow({ customer_org_id: 'zedcor', cost_usd: 0.20 }),
      dispatchRow({ customer_org_id: 'acme-pilot', cost_usd: 0.15 }),
      dispatchRow({ customer_org_id: 'noop-org', cost_usd: 0 }),
    ];
    const summary = aggregate('7d', [], dispatches, NOW);
    expect(summary.dispatch_count).toBe(3);
    expect(summary.by_customer).toEqual([
      expect.objectContaining({ key: 'zedcor', cost_usd: 0.5, call_count: 2 }),
      expect.objectContaining({ key: 'acme-pilot', cost_usd: 0.15, call_count: 1 }),
    ]);
    expect(summary.total_cost_usd).toBeCloseTo(0.65, 6);
  });

  it('bins daily across 7d window and merges both sources', () => {
    const today = NOW.toISOString();
    const yesterday = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const llm = [
      llmRow({ created_at: today, cost_usd: 0.10 }),
      llmRow({ created_at: yesterday, cost_usd: 0.20 }),
      llmRow({ created_at: yesterday, cost_usd: 0.05 }),
    ];
    const dispatches = [dispatchRow({ created_at: twoDaysAgo, cost_usd: 0.40 })];

    const summary = aggregate('7d', llm, dispatches, NOW);
    expect(summary.daily).toHaveLength(7);
    const byDay = new Map(summary.daily.map((d) => [d.bucket, d]));
    expect(byDay.get('2026-05-03')!.cost_usd).toBeCloseTo(0.10, 6);
    expect(byDay.get('2026-05-03')!.call_count).toBe(1);
    expect(byDay.get('2026-05-02')!.cost_usd).toBeCloseTo(0.25, 6);
    expect(byDay.get('2026-05-02')!.call_count).toBe(2);
    expect(byDay.get('2026-05-01')!.cost_usd).toBeCloseTo(0.40, 6);
    expect(byDay.get('2026-05-01')!.call_count).toBe(1);
  });

  it('drops llm rows outside the daily window from the trend (still counts in totals)', () => {
    const inWindow = NOW.toISOString();
    const outOfWindow = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const llm = [
      llmRow({ created_at: inWindow, cost_usd: 0.10 }),
      llmRow({ created_at: outOfWindow, cost_usd: 1.00 }),
    ];
    const summary = aggregate('7d', llm, [], NOW);
    // Both rows fed totals (caller is expected to pre-filter by window when
    // strict isolation is needed; aggregate is permissive on extras).
    expect(summary.total_cost_usd).toBeCloseTo(1.10, 6);
    const trendTotal = summary.daily.reduce((s, d) => s + d.cost_usd, 0);
    expect(trendTotal).toBeCloseTo(0.10, 6);
  });

  it('treats null agent_name as (unknown)', () => {
    const summary = aggregate(
      '7d',
      [llmRow({ agent_name: null, cost_usd: 0.10 })],
      [],
      NOW,
    );
    expect(summary.by_agent[0].key).toBe('(unknown)');
  });

  it('sorts breakdowns by cost descending', () => {
    const summary = aggregate(
      '7d',
      [
        llmRow({ agent_name: 'a', cost_usd: 0.01 }),
        llmRow({ agent_name: 'b', cost_usd: 0.50 }),
        llmRow({ agent_name: 'c', cost_usd: 0.10 }),
      ],
      [],
      NOW,
    );
    expect(summary.by_agent.map((b) => b.key)).toEqual(['b', 'c', 'a']);
  });
});
