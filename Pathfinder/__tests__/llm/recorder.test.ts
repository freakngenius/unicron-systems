// Unit tests for the LLM call recorder — Phase 1 G1 Task A5.
//
// Verifies recordLLMCall builds the right insert row shape. The supabase
// client is mocked at the module level so this test never touches the DB.

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { recordLLMCall } from '@/lib/llm/recorder';

describe('lib/llm/recorder — recordLLMCall', () => {
  afterEach(() => {
    mockInsert.mockClear();
    mockFrom.mockClear();
  });

  it('inserts a fully-populated row into pathfinder.llm_calls', async () => {
    recordLLMCall({
      model: 'claude-sonnet-4-6',
      surface: 'cron',
      inputTokens: 100,
      outputTokens: 5,
      cachedInputTokens: 10,
      costUsd: 0.0042,
      latencyMs: 250,
      cacheHit: false,
      agentRunId: 42,
      agentName: 'ranker',
      sessionId: null,
    });

    // Recorder is fire-and-forget; await one microtask cycle so the dynamic
    // supabase import resolves and the insert call lands.
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFrom).toHaveBeenCalledWith('llm_calls');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.model).toBe('claude-sonnet-4-6');
    expect(row.surface).toBe('cron');
    expect(row.input_tokens).toBe(100);
    expect(row.output_tokens).toBe(5);
    expect(row.cached_input_tokens).toBe(10);
    expect(row.cost_usd).toBe(0.0042);
    expect(row.latency_ms).toBe(250);
    expect(row.cache_hit).toBe(false);
    expect(row.agent_run_id).toBe(42);
    expect(row.agent_name).toBe('ranker');
    expect(row.session_id).toBe(null);
  });

  it('defaults optional fields when omitted', async () => {
    recordLLMCall({
      model: 'sonar',
      surface: 'chat',
      inputTokens: 50,
      outputTokens: 10,
      costUsd: 0.001,
      latencyMs: 800,
    });

    await new Promise((r) => setTimeout(r, 10));

    const row = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.cached_input_tokens).toBe(0);
    expect(row.cache_hit).toBe(false);
    expect(row.agent_run_id).toBe(null);
    expect(row.agent_name).toBe(null);
    expect(row.session_id).toBe(null);
  });
});
