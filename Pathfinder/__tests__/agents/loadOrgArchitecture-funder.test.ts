// __tests__/agents/loadOrgArchitecture-funder.test.ts
// Funder onboarding Stage 2 — round-trip the canonical Funder architecture
// JSON through resolveArchitecture and assert the Funder-shaped values
// survive merge with BASE_ARCHITECTURE.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 2.
// Plan: Pathfinder/docs/PLAN-funder-onboarding.md §3 Stage 2.

import { describe, expect, it } from 'vitest';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { BASE_ARCHITECTURE } from '@/lib/config/baseTemplate';
import type { OrgArchitecture } from '@/lib/types/architecture';
import funderFixture from '../fixtures/funder-architecture.json';

// strip the _comment header before resolving — the field is not part of
// the OrgArchitecture type and resolveArchitecture forwards unknown keys
// silently anyway, but this keeps the test intent honest.
const { _comment: _ignored, ...funderArchInput } = funderFixture as unknown as Record<string, unknown>;

describe('Funder architecture round-trips through resolveArchitecture', () => {
  const resolved: OrgArchitecture = resolveArchitecture(funderArchInput);

  it('preserves Funder vertical and lead unit identity', () => {
    expect(resolved.vertical).toBe('philanthropic-deal-sourcing');
    expect(resolved.lead_unit.name).toBe('opportunity');
    expect(resolved.lead_unit.plural).toBe('opportunities');
  });

  it('preserves Funder-specific lead schema fields', () => {
    const s = resolved.lead_unit.schema;
    expect(s.org_name?.required).toBe(true);
    expect(s.legal_form?.enum_values).toContain('llc-mission-lock');
    expect(s.thesis_area?.enum_values).toContain('ai-safety');
    expect(s.thesis_area?.enum_values).toContain('biosecurity');
    expect(s.fundraising_stage?.enum_values).toContain('actively-raising');
    expect(s.geo_hub?.enum_values).toContain('sf-bay');
    expect(s.founders?.type).toBe('object');
  });

  it('preserves Funder pipeline stages and labels (not BASE stages)', () => {
    expect(resolved.pipeline.stages).toEqual([
      'sourced',
      'reviewing',
      'contacted',
      'in-diligence',
      'funded',
      'passed',
    ]);
    expect(resolved.pipeline.stage_labels['in-diligence']).toBe('In diligence');
  });

  it('preserves Funder scoring weights and thresholds (0..1 scale)', () => {
    expect(resolved.scoring.weights.thesis_fit).toBe(0.3);
    expect(resolved.scoring.weights.founder_credential).toBe(0.25);
    expect(resolved.scoring.weights.raise_stage).toBe(0.15);
    expect(resolved.scoring.weights.talent_density).toBe(0.12);
    expect(resolved.scoring.weights.peer_funder_signal).toBe(0.1);
    expect(resolved.scoring.weights.recency).toBe(0.08);
    expect(resolved.scoring.thresholds.verified).toBe(0.65);
    expect(resolved.scoring.thresholds.high_priority).toBe(0.8);
  });

  it('weighted feature weights sum to 1.0 (well-formed Funder ranker)', () => {
    const sum = Object.values(resolved.scoring.weights).reduce((a, b) => a + b, 0);
    // Allow tiny float wobble; 0.30 + 0.25 + 0.15 + 0.12 + 0.10 + 0.08 = 1.00.
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-9);
  });

  it('preserves Funder geography defaults (philanthropic hubs)', () => {
    expect(resolved.geography.scope).toBe('metros');
    expect(resolved.geography.defaults).toEqual([
      'sf-bay',
      'nyc',
      'dc-metro',
      'boston',
      'london',
    ]);
  });

  it('preserves all 7 Funder source refs in pending status', () => {
    const ids = resolved.sources.map((s) => s.id).sort();
    expect(ids).toEqual([
      'business-license-issuances',
      'custom-accelerator-cohort-pages',
      'custom-ea-forum-rss',
      'custom-funder-990-filings',
      'custom-irs-exempt-org-filings',
      'custom-philanthropy-trade-press-rss',
      'custom-propublica-nonprofit-explorer',
    ]);
    expect(resolved.sources.every((s) => s.type === 'pending')).toBe(true);
  });

  it('preserves Funder outreach voice and integrations', () => {
    expect(resolved.outreach.persona).toContain('philanthropic deal-sourcing lead');
    expect(resolved.outreach.tone).toContain('warm, peer-to-peer');
    expect(resolved.integrations).toEqual(['hubspot', 'slack', 'resend']);
    expect(resolved.compliance).toEqual(['public-data-only']);
  });

  it('preserves Funder vocabulary overrides', () => {
    expect(resolved.vocabulary.lead).toBe('opportunity');
    expect(resolved.vocabulary.contact).toBe('founder');
    expect(resolved.vocabulary.project).toBe('organization');
  });

  it('preserves Funder branding (display_name = "Funder")', () => {
    expect(resolved.branding.display_name).toBe('Funder');
  });

  it('preserves Funder ui_plan (KPIs, charts, filters, lead card layout)', () => {
    const ui = resolved.ui_plan!;
    expect(ui.dashboard_emphasis).toBe('quality');
    expect(ui.lead_card_layout.primary_fields).toContain('org_name');
    expect(ui.lead_card_layout.primary_fields).toContain('thesis_area');
    expect(ui.lead_card_layout.score_position).toBe('top-right');
    expect(ui.kpis.map((k) => k.metric_id)).toEqual([
      'verified_count_7d',
      'actively_raising_count',
      'avg_score',
      'sources_live',
    ]);
    expect(ui.charts.map((c) => c.metric_id)).toEqual([
      'count_by_thesis',
      'verified_count',
    ]);
    expect(ui.filters.map((f) => f.field)).toEqual([
      'thesis_area',
      'fundraising_stage',
      'geo_hub',
      'legal_form',
    ]);
  });

  it('preserves business_summary (Funder lead_type / problem_solved / what_they_get)', () => {
    const bs = resolved.business_summary!;
    expect(bs.lead_type).toContain('philanthropic capital');
    expect(bs.problem_solved).toContain('relationship-based philanthropy');
    expect(bs.what_they_get.toLowerCase()).toContain('weekly curated deal memo');
  });

  it('does NOT regress BASE outreach fallbacks for unrelated orgs', () => {
    // Sanity: a fresh BASE merge with an empty partial still yields the
    // platform defaults — Funder must not bleed into the generic baseline.
    const baseline = resolveArchitecture({});
    expect(baseline.outreach.persona).toBe(BASE_ARCHITECTURE.outreach.persona);
    expect(baseline.branding.display_name).toBe(BASE_ARCHITECTURE.branding.display_name);
  });
});
