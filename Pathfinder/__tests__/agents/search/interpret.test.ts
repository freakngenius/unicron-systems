// __tests__/agents/search/interpret.test.ts — ICP Saved Search S2.
//
// Architect + NAICS classifier are mocked; this test verifies the shape of
// the produced SearchArchitecture and the error contract.

import { describe, it, expect, vi } from 'vitest';
import { interpretIcp } from '@/lib/agents/search/interpret';
import type { DecompositionResponse } from '@/services/architect/types';

function decompFixture(): DecompositionResponse {
  return {
    proposal_id: 'prop-1',
    session_id: 'sess-1',
    architecture: {
      buyer: 'construction-vertical contractors',
      buying_signal: 'NAICS 236220 active SAM.gov registration in TX',
      data_sources_proposed: [
        { type: 'sam.gov', jurisdictions: ['federal'], expected_daily_volume: 50 },
        { type: 'usaspending', jurisdictions: ['federal'], expected_daily_volume: 25 },
      ],
      data_sources_rejected: [],
      layer_2_watchers: [],
      layer_3_agents: [
        { role: 'recent_award_signal', instruction: 'flag entities with award in last 90 days' },
      ],
      layer_4_agents: [
        { role: 'web_enricher', instruction: 'pull domain + headcount from public profile' },
      ],
      estimates: {
        daily_qualified_volume: 8,
        cost_per_lead_usd: 0.12,
        architecture_confidence: 'medium',
      },
      open_questions: [],
      business_summary: {
        lead_type: 'commercial general contractor',
        business_area: 'Texas construction',
        problem_solved: 'pre-bid intel on active site work',
        what_they_get: 'a feed of contractors with site security needs',
      },
    },
    reasoning: ['decomposed'],
    cost_usd: 0.04,
    duration_ms: 5_000,
    status: 'completed',
  };
}

describe('interpretIcp', () => {
  it('rejects ICP text under the minimum length', async () => {
    await expect(interpretIcp('short')).rejects.toThrow(/at least/);
  });

  it('produces an architecture with NAICS + keywords + lead schema', async () => {
    const runDecomposition = vi.fn().mockResolvedValue(decompFixture());
    const runLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        naics_codes: ['236220', '237310', '01'], // '01' too short, filtered
        psc_codes: ['Y1AA'],
        keywords: ['commercial general contractor', 'site security', 'pre-bid signal', 'commercial general contractor'],
      }),
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0, costUsd: 0.01, latencyMs: 200, cacheHit: false },
    });

    const result = await interpretIcp(
      'Houston-area commercial general contractors doing site work over $1M who need temporary security coverage during construction.',
      { runDecomposition, runLlm, newId: () => 'vertical-test' },
    );

    expect(runDecomposition).toHaveBeenCalledOnce();
    expect(runLlm).toHaveBeenCalledOnce();

    expect(result.architecture.vertical).toBe('vertical-test');
    expect(result.architecture.naics_codes).toEqual(['236220', '237310']); // bad code filtered
    expect(result.architecture.psc_codes).toEqual(['Y1AA']);
    expect(result.architecture.keywords).toEqual([
      'commercial general contractor',
      'site security',
      'pre-bid signal',
    ]); // duplicate stripped
    expect(result.architecture.business_summary.lead_type).toBe('commercial general contractor');
    // Scoring signals: 2 from layer agents + 3 baseline = 5
    const names = result.architecture.scoring_signals.map((s) => s.name);
    expect(names).toContain('recent_award_signal');
    expect(names).toContain('web_enricher');
    expect(names).toContain('geo_proximity');
    expect(names).toContain('signal_recency');
    expect(names).toContain('naics_fit');
    // Lead schema has the baseline fields
    expect(result.architecture.lead_schema).toHaveProperty('company_name');
    expect(result.architecture.lead_schema).toHaveProperty('signal_type');
    expect(result.architect_session_id).toBe('sess-1');
    expect(result.cost_usd).toBeCloseTo(0.05);
  });

  it('falls back to heuristic keywords when the NAICS LLM call throws', async () => {
    const runDecomposition = vi.fn().mockResolvedValue(decompFixture());
    const runLlm = vi.fn().mockRejectedValue(new Error('upstream 500'));

    const result = await interpretIcp(
      'Commercial General Contractors in Houston Texas doing Site Work.',
      { runDecomposition, runLlm, newId: () => 'vertical-fallback' },
    );

    expect(result.architecture.naics_codes).toEqual([]);
    expect(result.architecture.psc_codes).toEqual([]);
    expect(result.architecture.keywords.length).toBeGreaterThan(0); // fallback heuristic fired
    expect(result.architecture.business_summary.lead_type).toBe('commercial general contractor');
  });

  it('parses JSON when the model returns it inside code fences', async () => {
    const runDecomposition = vi.fn().mockResolvedValue(decompFixture());
    const runLlm = vi.fn().mockResolvedValue({
      content: '```json\n{"naics_codes": ["541310"], "psc_codes": [], "keywords": ["architecture services"]}\n```',
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0, costUsd: 0.01, latencyMs: 200, cacheHit: false },
    });

    const result = await interpretIcp(
      'Mid-sized architecture firms in California with environmental review experience.',
      { runDecomposition, runLlm, newId: () => 'vertical-fenced' },
    );

    expect(result.architecture.naics_codes).toEqual(['541310']);
    expect(result.architecture.keywords).toEqual(['architecture services']);
  });

  it('surfaces the Architect failure when decomposition throws', async () => {
    const runDecomposition = vi.fn().mockRejectedValue(new Error('architect timed out'));
    const runLlm = vi.fn();

    await expect(
      interpretIcp(
        'Houston-area commercial general contractors who need temporary security coverage during construction.',
        { runDecomposition, runLlm },
      ),
    ).rejects.toThrow(/architect timed out/);
    expect(runLlm).not.toHaveBeenCalled();
  });
});
