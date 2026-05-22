// __tests__/agents/funder-verifier.test.ts
// Funder onboarding Stage 6 — Funder verifier check tests.

import { describe, it, expect } from 'vitest';
import { verifyFunderProject } from '@/lib/agents/verifier/funderChecks';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import funderFixture from '../fixtures/funder-architecture.json';
import type { Project } from '@/lib/types';

const { _comment: _x, ...funderInput } = funderFixture as unknown as Record<string, unknown>;
const FUNDER_ARCH = resolveArchitecture(funderInput);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    source: 'custom-propublica-nonprofit-explorer',
    source_id: 'p1',
    title: 'Alignment Research Inc',
    summary: 'AI safety research nonprofit working on alignment.',
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: new Date().toISOString(),
    raw_payload: { ein: 123456789, founder_affiliation: 'OpenAI alignment team' },
    rationale: null,
    rationale_streamed_at: null,
    score: 75,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: new Date().toISOString(),
    ranked_at: new Date().toISOString(),
    organization_id: 'funder-uuid',
    ...overrides,
  };
}

describe('Funder verifier', () => {
  it('verifies a clean candidate with score above threshold', () => {
    const v = verifyFunderProject({ project: makeProject(), architecture: FUNDER_ARCH });
    expect(v.verified).toBe(true);
    expect(v.checks.org_exists).toBe(true);
    expect(v.checks.founder_credible).toBe(true);
    expect(v.checks.not_widely_funded).toBe(true);
    expect(v.checks.score_above_threshold).toBe(true);
    expect(v.verified_threshold_0_100).toBe(65); // Funder arch verified=0.65 × 100
  });

  it('reads threshold from architecture (× 100)', () => {
    const v = verifyFunderProject({ project: makeProject({ score: 60 }), architecture: FUNDER_ARCH });
    // 60 < 65 threshold → fails score check, fails overall.
    expect(v.checks.score_above_threshold).toBe(false);
    expect(v.verified).toBe(false);
    expect(v.failures.some((f) => f.startsWith('score_below_threshold'))).toBe(true);
  });

  it('rejects when org name is too short', () => {
    const v = verifyFunderProject({
      project: makeProject({ title: 'Ab' }),
      architecture: FUNDER_ARCH,
    });
    expect(v.checks.org_exists).toBe(false);
    expect(v.verified).toBe(false);
  });

  it('rejects placeholder org names', () => {
    const v = verifyFunderProject({
      project: makeProject({ title: 'TBD' }),
      architecture: FUNDER_ARCH,
    });
    expect(v.checks.org_exists).toBe(false);
  });

  it('rejects when no Tier 1/Tier 2 institution AND source not trusted', () => {
    const v = verifyFunderProject({
      project: makeProject({
        source: 'custom-philanthropy-trade-press-rss',
        summary: 'A new fundraising banquet.',
        raw_payload: { ein: 999 },
      }),
      architecture: FUNDER_ARCH,
    });
    expect(v.checks.founder_credible).toBe(false);
  });

  it('source-trusted (ProPublica, IRS) passes founder check even without affiliation', () => {
    const v = verifyFunderProject({
      project: makeProject({
        source: 'custom-irs-exempt-org-filings',
        summary: 'New foundation registered',
        raw_payload: { ein: 999 },
      }),
      architecture: FUNDER_ARCH,
    });
    expect(v.checks.founder_credible).toBe(true);
  });

  it('flags widely-funded projects (3+ peer funder mentions in summary)', () => {
    const v = verifyFunderProject({
      project: makeProject({
        summary:
          'Backed by Open Philanthropy, Survival and Flourishing Fund, Founders Pledge, and Longview Philanthropy.',
      }),
      architecture: FUNDER_ARCH,
    });
    expect(v.checks.not_widely_funded).toBe(false);
    expect(v.verified).toBe(false);
  });

  it('funder-990 enrichment entries trivially pass the peer-funder check', () => {
    const v = verifyFunderProject({
      project: makeProject({ source: 'custom-funder-990-filings', score: 70 }),
      architecture: FUNDER_ARCH,
    });
    // org_exists may fail without EIN, but the peer-funder check itself
    // should pass.
    expect(v.checks.not_widely_funded).toBe(true);
  });
});
