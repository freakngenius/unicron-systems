// Unit tests for the LLM call recorder — Phase 1 G1 Task A5.
//
// Verifies recordLLMCall builds the right insert row shape. The supabase
// client is mocked at the module level so this test never touches the DB.

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock('@/lib/supabase', () => ({
  // Recorder uses supabaseAdmin() (service role) — anon RLS rejects writes
  // to pathfinder.llm_calls. Mock both so this file documents the contract
  // and any accidental revert to anon would still resolve the mock.
  supabase: { from: mockFrom },
  supabaseAdmin: () => ({ from: mockFrom }),
}));

const mockLogAxiom = vi.fn();
vi.mock('@/lib/observability/axiom', () => ({
  logAxiom: (event: unknown) => mockLogAxiom(event),
  trackEvent: vi.fn(),
}));

import { recordLLMCall } from '@/lib/llm/recorder';

describe('lib/llm/recorder — recordLLMCall', () => {
  afterEach(() => {
    mockInsert.mockClear();
    mockFrom.mockClear();
    mockLogAxiom.mockClear();
    mockInsert.mockResolvedValue({ error: null });
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

  it('fires an Axiom error event when writeRow rejects (Stream A Finding C)', async () => {
    // Simulate an RLS / CHECK / schema rejection — the silent-failure
    // mode that hid the Phase 1 G1+G2 recorder bug for days. Axiom
    // must surface this as level=error so operator dashboards alert.
    mockInsert.mockResolvedValueOnce({ error: { message: 'rls rejected' } });

    recordLLMCall({
      model: 'claude-sonnet-4-6',
      surface: 'cron',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.0001,
      latencyMs: 10,
      agentName: 'ranker',
      agentRunId: 7,
    });

    // Recorder is fire-and-forget: dynamic import + insert + .catch()
    // need a couple microtask cycles to flush.
    await new Promise((r) => setTimeout(r, 20));

    const errorEvent = mockLogAxiom.mock.calls
      .map((c) => c[0] as { level: string; message: string; error?: string })
      .find((e) => e.level === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toContain('recorder write failed');
    expect(errorEvent!.error).toContain('rls rejected');
  });
});
