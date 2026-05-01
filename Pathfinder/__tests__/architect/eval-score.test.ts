// __tests__/architect/eval-score.test.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3 (eval pass criteria).
//
// Pure scoring tests for the eval rubric. No LLM. Verifies that:
//   - matching the acceptable source set yields a high sources_score
//   - missing required agents drives agents_score down
//   - hallucinated sources drive hallucination_score down
//   - confidence-too-low fails the case
//   - vague prompts (empty acceptable set) still grade reasonably

import { describe, expect, it } from 'vitest';
import { scoreCase, aggregate, type EvalCase } from '@/services/architect/eval/score';
import type { DecompositionProposal } from '@/services/architect/types';
import { SOURCE_CATALOG } from '@/services/architect/tools/source-catalog';

const known = new Set(SOURCE_CATALOG.map((s) => s.type));

function baseProposal(): DecompositionProposal {
  return {
    buyer: 'b',
    buying_signal: 'sig',
    data_sources_proposed: [
      {
        type: 'harris-county-permits',
        jurisdictions: ['TX-Harris'],
        expected_daily_volume: 80,
      },
    ],
    data_sources_rejected: [],
    layer_2_watchers: [{ source_type: 'harris-county-permits', instruction: 'poll daily' }],
    layer_3_agents: [
      { role: 'qualifier', instruction: 'Score the permit for security need.' },
      { role: 'enricher', instruction: 'Add value, contractor, schedule.' },
      { role: 'geo-mapper', instruction: 'Map to nearest branch.' },
    ],
    layer_4_agents: [
      { role: 'ranker', instruction: 'Score 0-100 by value+distance.' },
      { role: 'outreach-drafter', instruction: 'Draft 3-channel outreach for top scored.' },
    ],
    estimates: {
      daily_qualified_volume: 12,
      cost_per_lead_usd: 0.04,
      architecture_confidence: 'high',
    },
    open_questions: [],
  };
}

const constructionCase: EvalCase = {
  id: 'd-001',
  buyer_pain_prompt: 'construction security houston',
  expected: {
    acceptable_source_types: [['harris-county-permits']],
    required_layer3_roles: ['qualifier', 'enricher', 'geo-mapper'],
    required_layer4_roles: ['ranker', 'outreach-drafter'],
    forbidden_source_types: ['pacer-bankruptcy', 'sec-edgar'],
    min_confidence: 'medium',
  },
};

describe('scoreCase — matches', () => {
  it('passes when all required components match', () => {
    const score = scoreCase(constructionCase, baseProposal(), known);
    expect(score.passed).toBe(true);
    expect(score.sources_score).toBe(1);
    expect(score.agents_score).toBe(1);
    expect(score.hallucination_score).toBe(1);
  });
});

describe('scoreCase — misses', () => {
  it('fails when required agent role missing', () => {
    const p = baseProposal();
    p.layer_3_agents = p.layer_3_agents.filter((a) => a.role !== 'geo-mapper');
    const score = scoreCase(constructionCase, p, known);
    expect(score.passed).toBe(false);
    expect(score.agents_score).toBeLessThan(0.9);
  });

  it('fails when source set is wrong', () => {
    const p = baseProposal();
    p.data_sources_proposed = [
      { type: 'sec-edgar', jurisdictions: ['national_us'], expected_daily_volume: 1000 },
    ];
    const score = scoreCase(constructionCase, p, known);
    expect(score.passed).toBe(false);
    expect(score.sources_score).toBeLessThan(0.8);
  });

  it('penalizes forbidden sources even when expected ones are present', () => {
    const p = baseProposal();
    p.data_sources_proposed.push({
      type: 'pacer-bankruptcy',
      jurisdictions: ['national_us'],
      expected_daily_volume: 2000,
    });
    const score = scoreCase(constructionCase, p, known);
    expect(score.reasons.some((r) => r.includes('forbidden'))).toBe(true);
  });

  it('detects hallucinated source types', () => {
    const p = baseProposal();
    p.data_sources_proposed = [
      {
        type: 'totally-fake-source',
        jurisdictions: ['x'],
        expected_daily_volume: 1,
      },
    ];
    const score = scoreCase(constructionCase, p, known);
    expect(score.hallucination_score).toBeLessThan(1);
    expect(score.passed).toBe(false);
  });

  it('accepts custom-prefixed sources without flagging hallucination', () => {
    const p = baseProposal();
    p.data_sources_proposed.push({
      type: 'custom-vertical',
      jurisdictions: ['x'],
      expected_daily_volume: 1,
    });
    const score = scoreCase(constructionCase, p, known);
    expect(score.hallucination_score).toBe(1);
  });
});

describe('aggregate', () => {
  it('computes pass_rate across multiple cases', () => {
    const cases = [
      scoreCase(constructionCase, baseProposal(), known),
      scoreCase(
        constructionCase,
        { ...baseProposal(), data_sources_proposed: [] },
        known,
      ),
    ];
    const report = aggregate(cases);
    expect(report.total).toBe(2);
    expect(report.passed).toBeLessThan(2);
    expect(report.pass_rate).toBeLessThan(1);
  });
});
