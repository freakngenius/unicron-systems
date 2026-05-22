// __tests__/agents/internal-ranker.test.ts
//
// Stage 6 — Internal six-feature ranker.
//
// Each extractor must return a 0..1 normalized value. The weighted sum
// uses Internal's architecture weights (0.25 / 0.20 / 0.15 / 0.15 / 0.15 / 0.10).

import { describe, it, expect } from 'vitest';
import { scoreGenericProject } from '@/lib/agents/ranker/genericScorer';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

const INTERNAL_ARCH = {
  vertical: 'construction-vertical-b2b-prospecting',
  lead_unit: { name: 'company', plural: 'companies', schema: {} },
  pipeline: { stages: [], stage_labels: {} },
  scoring: {
    weights: {
      sales_motion_strength: 0.25,
      operational_footprint: 0.20,
      federal_signal: 0.15,
      project_driven_fit: 0.15,
      recency: 0.15,
      association_presence: 0.10,
    },
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

const ZEDCOR_ARCH = {
  vertical: 'construction',
  lead_unit: { name: 'project', plural: 'projects', schema: {} },
  pipeline: { stages: [], stage_labels: {} },
  scoring: {
    weights: { geography_match: 0.5, trigger_strength: 0.3, asset_class_match: 0.2 },
    thresholds: { verified: 0.5, high_priority: 0.7 },
  },
  geography: { scope: 'states', defaults: ['TX'] },
  sources: [],
  outreach: { persona: '', tone: '', value_prop: '' },
  vocabulary: {},
  branding: { display_name: 'Zedcor' },
  compliance: [],
  integrations: [],
} as unknown as OrgArchitecture;

function project(overrides: Partial<Project> & { state?: string | null } = {}): Project & { state?: string | null } {
  return {
    id: 'p1',
    source: 'sam-gov',
    source_id: 'p1',
    title: 'Acme Site Services',
    summary: 'Construction equipment rental',
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: new Date().toISOString(),
    raw_payload: null,
    rationale: null,
    rationale_streamed_at: null,
    score: null,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: new Date().toISOString(),
    ranked_at: null,
    organization_id: '2ff1197b-36f8-4210-aa11-65cf025ad83b',
    ...overrides,
  } as unknown as Project & { state?: string | null };
}

describe('Internal ranker — six feature extractors', () => {
  describe('sales_motion_strength', () => {
    it('scores 1.0 for active-outbound', () => {
      const r = scoreGenericProject(
        project({ raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } } }),
        { ...INTERNAL_ARCH, scoring: { weights: { sales_motion_strength: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.sales_motion_strength).toBe(1.0);
    });
    it('scores 0.8 for hiring-bd', () => {
      const r = scoreGenericProject(
        project({ raw_payload: { internal_enrichment: { sales_motion: 'hiring-bd' } } }),
        { ...INTERNAL_ARCH, scoring: { weights: { sales_motion_strength: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.sales_motion_strength).toBeCloseTo(0.8);
    });
    it('falls back to qualifier signal in raw_payload', () => {
      const r = scoreGenericProject(
        project({ raw_payload: { internal_sales_motion_signal: 'hiring-bd' } }),
        { ...INTERNAL_ARCH, scoring: { weights: { sales_motion_strength: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.sales_motion_strength).toBeCloseTo(0.8);
    });
  });

  describe('operational_footprint', () => {
    it('scores higher with more operating states', () => {
      const r10 = scoreGenericProject(
        project({ raw_payload: { internal_geo: { operating_states: ['TX', 'OK', 'LA', 'NM', 'AR', 'MS', 'AL', 'TN', 'KY', 'CO'] } } }),
        { ...INTERNAL_ARCH, scoring: { weights: { operational_footprint: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r10.components.operational_footprint).toBe(1.0);
      const r2 = scoreGenericProject(
        project({ raw_payload: { internal_geo: { operating_states: ['TX', 'OK'] } } }),
        { ...INTERNAL_ARCH, scoring: { weights: { operational_footprint: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r2.components.operational_footprint).toBeCloseTo(0.4);
    });
    it('scores 0 with no footprint data', () => {
      const r = scoreGenericProject(project(), {
        ...INTERNAL_ARCH,
        scoring: { weights: { operational_footprint: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } },
      });
      expect(r.components.operational_footprint).toBe(0);
    });
  });

  describe('federal_signal', () => {
    it('scores 1.0 for federal_registration=both', () => {
      const r = scoreGenericProject(
        project({ raw_payload: { internal_federal_registration: 'both' } }),
        { ...INTERNAL_ARCH, scoring: { weights: { federal_signal: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.federal_signal).toBe(1.0);
    });
    it('scores 0.8 for federal-awardee', () => {
      const r = scoreGenericProject(
        project({ raw_payload: { internal_federal_registration: 'federal-awardee' } }),
        { ...INTERNAL_ARCH, scoring: { weights: { federal_signal: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.federal_signal).toBeCloseTo(0.8);
    });
    it('falls back to source=usaspending', () => {
      const r = scoreGenericProject(
        project({ source: 'usaspending', raw_payload: null }),
        { ...INTERNAL_ARCH, scoring: { weights: { federal_signal: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.federal_signal).toBeCloseTo(0.8);
    });
  });

  describe('project_driven_fit', () => {
    it('scores 0.6+ on NAICS 238x match', () => {
      const r = scoreGenericProject(
        project({ raw_payload: { primary_naics: '238910' } }),
        { ...INTERNAL_ARCH, scoring: { weights: { project_driven_fit: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.project_driven_fit).toBeGreaterThanOrEqual(0.6);
    });
    it('adds award density boost', () => {
      const r = scoreGenericProject(
        project({ raw_payload: { primary_naics: '238910', awards: [1, 2, 3, 4, 5] } }),
        { ...INTERNAL_ARCH, scoring: { weights: { project_driven_fit: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.project_driven_fit).toBeGreaterThan(0.6);
    });
  });

  describe('association_presence', () => {
    it('scores 1.0 with 3+ associations', () => {
      const r = scoreGenericProject(
        project({ raw_payload: { internal_enrichment: { associations: ['ARA', 'AGC', 'NUCA'] } } }),
        { ...INTERNAL_ARCH, scoring: { weights: { association_presence: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.association_presence).toBe(1.0);
    });
    it('uses adjacency association_overlap when present', () => {
      const r = scoreGenericProject(
        project({
          raw_payload: {
            internal_adjacency: {
              association_overlap: [
                { association: 'ARA', via: 'X' },
                { association: 'AGC', via: 'Y' },
              ],
            },
          },
        }),
        { ...INTERNAL_ARCH, scoring: { weights: { association_presence: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } } },
      );
      expect(r.components.association_presence).toBeCloseTo(0.7);
    });
    it('scores 0 with no association evidence', () => {
      const r = scoreGenericProject(project(), {
        ...INTERNAL_ARCH,
        scoring: { weights: { association_presence: 1 }, thresholds: { verified: 0.65, high_priority: 0.8 } },
      });
      expect(r.components.association_presence).toBe(0);
    });
  });

  describe('weighted composite', () => {
    it('produces a 0..100 score using all six weights', () => {
      const r = scoreGenericProject(
        project({
          source: 'usaspending',
          posted_date: new Date().toISOString(),
          raw_payload: {
            internal_federal_registration: 'both',
            internal_enrichment: { sales_motion: 'active-outbound', associations: ['ARA', 'AGC'] },
            internal_geo: { operating_states: ['TX', 'OK', 'LA', 'NM', 'AR'] },
            primary_naics: '238910',
          },
        }),
        INTERNAL_ARCH,
      );
      expect(r.score).toBeGreaterThanOrEqual(70);
      expect(r.score).toBeLessThanOrEqual(100);
      // All six features should appear in the components map.
      expect(r.components).toHaveProperty('sales_motion_strength');
      expect(r.components).toHaveProperty('operational_footprint');
      expect(r.components).toHaveProperty('federal_signal');
      expect(r.components).toHaveProperty('project_driven_fit');
      expect(r.components).toHaveProperty('recency');
      expect(r.components).toHaveProperty('association_presence');
    });
  });

  describe('Zedcor regression — no new features touch Zedcor scoring', () => {
    it('Zedcor weight set still scores identically', () => {
      const p = project({
        title: 'Houston HQ ribbon',
        summary: 'Texas construction project',
        state: 'TX',
        project_stage: 'RFP',
      });
      const r = scoreGenericProject(p, ZEDCOR_ARCH);
      // 0.5 * geo_match(1) + 0.3 * trigger(RFP=1.0) + 0.2 * asset_class
      // (vertical token "construction" hits the summary) = 1.0
      expect(r.score).toBeGreaterThanOrEqual(95);
      expect(Object.keys(r.components).sort()).toEqual(
        ['asset_class_match', 'geography_match', 'trigger_strength'],
      );
    });
  });
});
