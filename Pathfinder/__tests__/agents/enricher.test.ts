// Unit tests for Enricher — Stream A Gate A2.
// Stubs the LLM gateway so no live Sonar call fires. Asserts:
//   - input contract (rejects missing project_id / title)
//   - request shape passed to run() — model, surface, agentName, prompt
//   - output shape — brief / citations / cost / latency
//   - usable-brief heuristic for the failure path

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockRun = vi.fn();

vi.mock('@/lib/llm/run', () => ({
  run: (req: unknown) => mockRun(req),
}));

import { enrichProject, isUsableBrief, ENRICHER_MODEL } from '@/lib/agents/enricher';

describe('lib/agents/enricher', () => {
  afterEach(() => {
    mockRun.mockReset();
  });

  it('builds a Sonar request with the agent attribution + recency filter', async () => {
    mockRun.mockResolvedValueOnce({
      content: 'Buyer is a multi-state restoration franchise headquartered in Atlanta.\n\nRecent funding: $40M Series C closed 2026-02.',
      citations: [{ url: 'https://example.com/press', title: 'example.com' }],
      model: 'sonar',
      usage: { inputTokens: 200, outputTokens: 180, costUsd: 0.0012, latencyMs: 4200, cacheHit: false, cachedInputTokens: 0 },
    });

    const out = await enrichProject({
      project_id: 'usaspending:abc',
      title: 'Restoration services for federal facility',
      summary: 'Multi-state award notice.',
      source: 'usaspending',
      agentRunId: 42,
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const req = mockRun.mock.calls[0][0] as {
      model: string;
      systemPrompt: string;
      messages: { role: string; content: string }[];
      surface: string;
      agentName: string;
      agentRunId: number;
      recencyDays: number;
      returnCitations: boolean;
    };
    expect(req.model).toBe(ENRICHER_MODEL);
    expect(req.surface).toBe('cron');
    expect(req.agentName).toBe('enricher');
    expect(req.agentRunId).toBe(42);
    expect(req.recencyDays).toBe(60);
    expect(req.returnCitations).toBe(true);
    expect(req.systemPrompt).toContain('Pathfinder Enricher');
    expect(req.messages[0].content).toContain('Restoration services for federal facility');
    expect(req.messages[0].content).toContain('Multi-state award notice.');

    expect(out.project_id).toBe('usaspending:abc');
    expect(out.brief).toContain('multi-state restoration franchise');
    expect(out.citations).toHaveLength(1);
    expect(out.model).toBe('sonar');
    expect(out.cost_usd).toBeCloseTo(0.0012);
    expect(out.latency_ms).toBe(4200);
  });

  it('rejects missing project_id', async () => {
    await expect(
      enrichProject({ project_id: '', title: 'x', source: 'y' }),
    ).rejects.toThrow('project_id');
  });

  it('rejects missing title', async () => {
    await expect(
      enrichProject({ project_id: 'p', title: '', source: 'y' }),
    ).rejects.toThrow('title');
  });

  it('overrides default scope when caller supplies one', async () => {
    mockRun.mockResolvedValueOnce({
      content: 'a'.repeat(120),
      citations: [],
      model: 'sonar',
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1, cacheHit: false, cachedInputTokens: 0 },
    });
    await enrichProject({
      project_id: 'p1',
      title: 't1',
      source: 's1',
      scope: 'compliance posture only',
    });
    const req = mockRun.mock.calls[0][0] as { messages: { content: string }[] };
    expect(req.messages[0].content).toContain('compliance posture only');
  });
});

describe('lib/agents/enricher — isUsableBrief', () => {
  it('treats the documented give-up sentinel as not usable', () => {
    expect(isUsableBrief('INSUFFICIENT_PUBLIC_RECORD')).toBe(false);
  });

  it('treats empty / whitespace-only text as not usable', () => {
    expect(isUsableBrief('')).toBe(false);
    expect(isUsableBrief('   ')).toBe(false);
  });

  it('treats a short stub as not usable', () => {
    expect(isUsableBrief('Could not find anything.')).toBe(false);
  });

  it('accepts a multi-paragraph brief over the threshold', () => {
    const brief =
      'Buyer is a multi-branch restoration franchise.\n\nFunding: closed Series C in 2026-02 for $40M (TechCrunch).';
    expect(isUsableBrief(brief)).toBe(true);
  });
});
