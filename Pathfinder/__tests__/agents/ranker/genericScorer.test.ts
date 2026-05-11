// Phase 2C slice 2 — generic per-org weighted scorer.
//
// Org-agnostic ranker for non-Zedcor orgs. Computes a 0-100 composite
// from architecture.scoring.weights. Replaces the construction-security
// hard-coded scoring in lib/scoring.ts:scoreProject for orgs whose
// architecture is driven by Architect rather than the Zedcor kernel.
//
// Spec: Company Docs/Metacron/SPEC - Phase 2C Dynamic Agent Dispatch.md
//       §"Ranker"
// Plan: docs/PLAN-phase2c-slice2-org-aware-ranker.md (v2 post-codex)

import { describe, expect, it } from 'vitest';
import { scoreGenericProject } from '@/lib/agents/ranker/genericScorer';
import type { OrgArchitecture } from '@/lib/types/architecture';

// Minimal architecture builder — only overrides the fields each test cares about.
function arch(partial: Partial<OrgArchitecture> = {}): OrgArchitecture {
  return {
    vertical: 'generic',
    lead_unit: { name: 'lead', plural: 'leads', schema: {} },
    pipeline: { stages: [], stage_labels: {} },
    scoring: { weights: {}, thresholds: { verified: 0.6, high_priority: 0.8 } },
    geography: { scope: 'states', defaults: [] },
    sources: [],
    outreach: { persona: '', tone: '', value_prop: '' },
    vocabulary: {},
    branding: { display_name: 'Test' },
    compliance: [],
    integrations: [],
    ...partial,
  };
}

// Minimal project builder.
function proj(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    source: 'sam.gov',
    source_id: 'src-1',
    title: 'Test project',
    summary: 'Test summary',
    lat: 40.0,
    lon: -75.0,
    project_value: null,
    project_stage: 'RFP',
    posted_date: '2026-05-01',
    raw_payload: {},
    rationale: null,
    rationale_streamed_at: null,
    score: null,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-05-11T00:00:00Z',
    ranked_at: null,
    country: 'USA',
    state: 'PA',
    ...overrides,
  } as unknown as Parameters<typeof scoreGenericProject>[0];
}

describe('scoreGenericProject', () => {
  it('returns 0 when no weights are configured (defensive zero)', () => {
    const a = arch({ scoring: { weights: {}, thresholds: { verified: 0.6, high_priority: 0.8 } } });
    const result = scoreGenericProject(proj(), a);
    expect(result.score).toBe(0);
  });

  it('full weight on geography_match scores 100 when project state matches architecture.geography.defaults', () => {
    const a = arch({
      geography: { scope: 'states', defaults: ['PA', 'NJ'] },
      scoring: { weights: { geography_match: 1.0 }, thresholds: { verified: 0.6, high_priority: 0.8 } },
    });
    const result = scoreGenericProject(proj({ state: 'PA' }), a);
    expect(result.score).toBe(100);
  });

  it('geography_match scores 0 when project state is not in defaults', () => {
    const a = arch({
      geography: { scope: 'states', defaults: ['CA'] },
      scoring: { weights: { geography_match: 1.0 }, thresholds: { verified: 0.6, high_priority: 0.8 } },
    });
    const result = scoreGenericProject(proj({ state: 'PA' }), a);
    expect(result.score).toBe(0);
  });

  it('trigger_strength scales by stage: RFP=1.0, PRE=0.75, PLN=0.55, NWS=0.35, other=0.5', () => {
    const a = arch({
      scoring: { weights: { trigger_strength: 1.0 }, thresholds: { verified: 0.6, high_priority: 0.8 } },
    });
    expect(scoreGenericProject(proj({ project_stage: 'RFP' }), a).score).toBe(100);
    expect(scoreGenericProject(proj({ project_stage: 'PRE' }), a).score).toBe(75);
    expect(scoreGenericProject(proj({ project_stage: 'PLN' }), a).score).toBe(55);
    expect(scoreGenericProject(proj({ project_stage: 'NWS' }), a).score).toBe(35);
    expect(scoreGenericProject(proj({ project_stage: 'UNKNOWN' }), a).score).toBe(50);
  });

  it('asset_class_match keyword-matches title/summary against architecture.vertical', () => {
    const a = arch({
      vertical: 'real-estate',
      scoring: { weights: { asset_class_match: 1.0 }, thresholds: { verified: 0.6, high_priority: 0.8 } },
    });
    expect(
      scoreGenericProject(
        proj({ title: 'Multifamily real-estate acquisition' }),
        a,
      ).score,
    ).toBe(100);
    expect(
      scoreGenericProject(
        proj({ title: 'Highway bridge construction', summary: 'civil works' }),
        a,
      ).score,
    ).toBe(0);
  });

  it('combines weighted features additively, clamped to [0, 100]', () => {
    const a = arch({
      vertical: 'real-estate',
      geography: { scope: 'states', defaults: ['PA'] },
      scoring: {
        weights: { geography_match: 0.5, trigger_strength: 0.5 },
        thresholds: { verified: 0.6, high_priority: 0.8 },
      },
    });
    // PA + RFP → 0.5*100 + 0.5*100 = 100
    expect(scoreGenericProject(proj({ state: 'PA', project_stage: 'RFP' }), a).score).toBe(100);
    // PA + NWS → 0.5*100 + 0.5*35 = 67.5 → rounded 68
    expect(scoreGenericProject(proj({ state: 'PA', project_stage: 'NWS' }), a).score).toBe(68);
    // CA + NWS (no geography match) → 0.5*0 + 0.5*35 = 17.5 → rounded 18
    expect(scoreGenericProject(proj({ state: 'CA', project_stage: 'NWS' }), a).score).toBe(18);
  });

  it('caps over-100 weight sums at 100', () => {
    const a = arch({
      geography: { scope: 'states', defaults: ['PA'] },
      scoring: {
        // Architect-emitted weights might sum to >1.0 if Architect drifts;
        // the clamp keeps the dashboard percentage well-bounded.
        weights: { geography_match: 2.0, trigger_strength: 3.0 },
        thresholds: { verified: 0.6, high_priority: 0.8 },
      },
    });
    expect(scoreGenericProject(proj({ state: 'PA', project_stage: 'RFP' }), a).score).toBe(100);
  });

  it('floors negative weighted sums at 0', () => {
    const a = arch({
      scoring: {
        weights: { trigger_strength: -1.0 },
        thresholds: { verified: 0.6, high_priority: 0.8 },
      },
    });
    expect(scoreGenericProject(proj({ project_stage: 'RFP' }), a).score).toBe(0);
  });

  it('ignores unknown weight keys without throwing (defensive forward-compat)', () => {
    const a = arch({
      scoring: {
        weights: { unknown_future_feature: 1.0, geography_match: 0.0 } as Record<string, number>,
        thresholds: { verified: 0.6, high_priority: 0.8 },
      },
    });
    // unknown_future_feature has no extractor → contributes 0
    expect(() => scoreGenericProject(proj(), a)).not.toThrow();
    expect(scoreGenericProject(proj(), a).score).toBe(0);
  });

  it('stubs basis_fit + unit_count_fit at 0 until per-vertical extractors land', () => {
    const a = arch({
      scoring: {
        weights: { basis_fit: 1.0, unit_count_fit: 1.0 },
        thresholds: { verified: 0.6, high_priority: 0.8 },
      },
    });
    // Plan §"Generic scoring approach" — these are stubbed in slice 2.
    // Per-vertical extractors land in a follow-up when Realberry has projects
    // to test against.
    expect(scoreGenericProject(proj(), a).score).toBe(0);
  });

  it('returns componentScores so the ranker can write them to agent_log for ops debugging', () => {
    const a = arch({
      geography: { scope: 'states', defaults: ['PA'] },
      scoring: {
        weights: { geography_match: 0.5, trigger_strength: 0.5 },
        thresholds: { verified: 0.6, high_priority: 0.8 },
      },
    });
    const result = scoreGenericProject(proj({ state: 'PA', project_stage: 'RFP' }), a);
    expect(result.components).toEqual(
      expect.objectContaining({
        geography_match: 1,
        trigger_strength: 1,
      }),
    );
  });
});
