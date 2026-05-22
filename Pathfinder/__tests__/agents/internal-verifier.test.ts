// __tests__/agents/internal-verifier.test.ts
//
// Stage 7 — Internal verifier checks.
//
// Pure deterministic checks. Asserts each of the four checks in
// isolation plus the full-verdict path.

import { describe, it, expect } from 'vitest';
import { verifyInternalProject } from '@/lib/agents/internal/verifier';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

const arch = {
  vertical: 'construction-vertical-b2b-prospecting',
  lead_unit: { name: 'company', plural: 'companies', schema: {} },
  pipeline: { stages: [], stage_labels: {} },
  scoring: {
    weights: {},
    thresholds: { verified: 0.65, high_priority: 0.8 },
  },
  geography: { scope: 'states', defaults: [] },
  sources: [],
  outreach: { persona: '', tone: '', value_prop: '' },
  vocabulary: {},
  branding: { display_name: 'Unicron Internal' },
  compliance: [],
  integrations: [],
} as unknown as OrgArchitecture;

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    source: 'sam-gov',
    source_id: 'p1',
    title: 'Acme Site Services LLC',
    summary: 'Construction services',
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: {
      internal_enrichment: {
        sales_motion: 'active-outbound',
        contacts: [{ name: 'Jane', title: 'VP Sales' }],
      },
      internal_geo: { hq_state: 'TX', operating_states: ['TX', 'OK'] },
      internal_federal_registration: 'sam-registered',
      primary_naics: '238910',
    },
    rationale: null,
    rationale_streamed_at: null,
    score: 80,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: new Date().toISOString(),
    ranked_at: new Date().toISOString(),
    organization_id: '2ff1197b-36f8-4210-aa11-65cf025ad83b',
    verified: null,
    verifier_pass_count: 0,
    ...overrides,
  } as unknown as Project;
}

describe('verifyInternalProject — Stage 7', () => {
  it('passes all four checks for a complete fixture', () => {
    const v = verifyInternalProject({ project: project(), architecture: arch });
    expect(v.verified).toBe(true);
    expect(v.checks.company_exists).toBe(true);
    expect(v.checks.sales_motion_corroborated).toBe(true);
    expect(v.checks.footprint_present).toBe(true);
    expect(v.checks.score_above_threshold).toBe(true);
    expect(v.verified_threshold_0_100).toBe(65);
  });

  it('fails company_exists for placeholder titles', () => {
    const v = verifyInternalProject({
      project: project({ title: 'TBD' }),
      architecture: arch,
    });
    expect(v.checks.company_exists).toBe(false);
    expect(v.verified).toBe(false);
  });

  it('fails sales_motion when no evidence is present', () => {
    const v = verifyInternalProject({
      project: project({
        raw_payload: {
          internal_geo: { hq_state: 'TX', operating_states: ['TX'] },
          primary_naics: '238910',
        },
      }),
      architecture: arch,
    });
    expect(v.checks.sales_motion_corroborated).toBe(false);
  });

  it('passes sales_motion via hiring-bd job source even without enrichment', () => {
    const v = verifyInternalProject({
      project: project({
        source: 'custom-construction-sales-job-postings',
        raw_payload: {
          internal_geo: { hq_state: 'TX', operating_states: ['TX'] },
          primary_naics: '238910',
        },
      }),
      architecture: arch,
    });
    expect(v.checks.sales_motion_corroborated).toBe(true);
  });

  it('fails footprint when no geo evidence is present', () => {
    const v = verifyInternalProject({
      project: project({
        raw_payload: {
          internal_enrichment: { sales_motion: 'active-outbound' },
          primary_naics: '238910',
        },
      }),
      architecture: arch,
    });
    expect(v.checks.footprint_present).toBe(false);
  });

  it('fails score_above_threshold when score < verified×100', () => {
    const v = verifyInternalProject({
      project: project({ score: 50 }),
      architecture: arch,
    });
    expect(v.checks.score_above_threshold).toBe(false);
    expect(v.verified).toBe(false);
  });

  it('reads thresholds from architecture (Stage 7 contract)', () => {
    const customArch = {
      ...arch,
      scoring: { weights: {}, thresholds: { verified: 0.9, high_priority: 0.95 } },
    } as OrgArchitecture;
    const v = verifyInternalProject({ project: project({ score: 80 }), architecture: customArch });
    expect(v.verified_threshold_0_100).toBe(90);
    expect(v.checks.score_above_threshold).toBe(false);
  });
});
