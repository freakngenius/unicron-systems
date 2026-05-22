// __tests__/agents/loadOrgArchitecture-internal.test.ts
// Internal onboarding Stage 2 — round-trip the canonical Internal architecture
// JSON through resolveArchitecture and assert the Internal-shaped values
// survive merge with BASE_ARCHITECTURE.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §9 Stage 2.
// Plan: Pathfinder/docs/PLAN-internal-onboarding.md Stage 2.

import { describe, expect, it } from 'vitest';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { BASE_ARCHITECTURE } from '@/lib/config/baseTemplate';
import type { OrgArchitecture } from '@/lib/types/architecture';
import internalFixture from '../fixtures/internal-architecture.json';

// strip the _comment header before resolving — the field is not part of
// the OrgArchitecture type and resolveArchitecture forwards unknown keys
// silently anyway, but this keeps the test intent honest.
const { _comment: _ignored, ...internalArchInput } = internalFixture as unknown as Record<string, unknown>;

describe('Internal architecture round-trips through resolveArchitecture', () => {
  const resolved: OrgArchitecture = resolveArchitecture(internalArchInput);

  it('preserves Internal vertical and lead unit identity', () => {
    expect(resolved.vertical).toBe('construction-vertical-b2b-prospecting');
    expect(resolved.lead_unit.name).toBe('company');
    expect(resolved.lead_unit.plural).toBe('companies');
  });

  it('preserves Internal-specific lead schema fields', () => {
    const s = resolved.lead_unit.schema;
    expect(s.company_name?.required).toBe(true);
    expect(s.service_category?.enum_values).toContain('equipment-rental');
    expect(s.service_category?.enum_values).toContain('temp-fence');
    expect(s.service_category?.enum_values).toContain('crane-rental');
    expect(s.sales_motion?.enum_values).toEqual([
      'active-outbound',
      'hiring-bd',
      'inbound-only',
      'unknown',
    ]);
    expect(s.federal_registration?.enum_values).toContain('sam-registered');
    expect(s.footprint?.type).toBe('object');
    expect(s.licensure?.type).toBe('object');
    expect(s.association_memberships?.type).toBe('object');
  });

  it('preserves Internal pipeline stages and labels (not BASE stages)', () => {
    expect(resolved.pipeline.stages).toEqual([
      'new-outreach-ready',
      'contacted',
      'in-conversation',
      'demo-scheduled',
      'proposal',
      'won',
      'lost',
    ]);
    expect(resolved.pipeline.stage_labels['new-outreach-ready']).toBe('New / Outreach Ready');
    expect(resolved.pipeline.stage_labels['in-conversation']).toBe('In conversation');
    expect(resolved.pipeline.stage_labels['demo-scheduled']).toBe('Demo scheduled');
  });

  it('preserves Internal scoring weights and thresholds (0..1 scale)', () => {
    expect(resolved.scoring.weights.sales_motion_strength).toBe(0.25);
    expect(resolved.scoring.weights.operational_footprint).toBe(0.2);
    expect(resolved.scoring.weights.federal_signal).toBe(0.15);
    expect(resolved.scoring.weights.project_driven_fit).toBe(0.15);
    expect(resolved.scoring.weights.recency).toBe(0.15);
    expect(resolved.scoring.weights.association_presence).toBe(0.1);
    expect(resolved.scoring.thresholds.verified).toBe(0.65);
    expect(resolved.scoring.thresholds.high_priority).toBe(0.8);
  });

  it('has exactly 6 scoring weights summing to 1.0 (well-formed Internal ranker)', () => {
    const keys = Object.keys(resolved.scoring.weights);
    expect(keys).toHaveLength(6);
    const sum = Object.values(resolved.scoring.weights).reduce((a, b) => a + b, 0);
    // Allow tiny float wobble; 0.25 + 0.20 + 0.15 + 0.15 + 0.15 + 0.10 = 1.00.
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-9);
  });

  it('preserves Internal geography (national US, no defaults)', () => {
    expect(resolved.geography.scope).toBe('states');
    expect(resolved.geography.defaults).toEqual([]);
  });

  it('preserves exactly 6 Internal source refs with expected ids', () => {
    expect(resolved.sources).toHaveLength(6);
    const ids = resolved.sources.map((s) => s.id).sort();
    expect(ids).toEqual([
      'custom-construction-sales-job-postings',
      'custom-sos-business-registrations',
      'custom-state-contractor-licenses',
      'custom-trade-association-directories',
      'sam-gov',
      'usaspending',
    ]);
    // 2 registered (sam-gov, usaspending), 4 pending (custom-*).
    const byType = resolved.sources.reduce<Record<string, number>>((acc, s) => {
      acc[s.type] = (acc[s.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType.registered).toBe(2);
    expect(byType.pending).toBe(4);
  });

  it('preserves Internal outreach voice and integrations', () => {
    expect(resolved.outreach.persona).toContain('new-business sales rep at Unicron Systems');
    expect(resolved.outreach.tone).toContain('direct, peer-to-peer');
    expect(resolved.integrations).toEqual(['hubspot', 'slack', 'resend']);
    expect(resolved.compliance).toEqual(['public-data-only']);
  });

  it('preserves Internal vocabulary overrides', () => {
    expect(resolved.vocabulary.lead).toBe('company');
    expect(resolved.vocabulary.leads).toBe('companies');
    expect(resolved.vocabulary.project).toBe('company');
    expect(resolved.vocabulary.branch).toBe('region');
  });

  it('preserves Internal branding (display_name = "Unicron Internal")', () => {
    expect(resolved.branding.display_name).toBe('Unicron Internal');
    expect(resolved.branding.accent_color).toBeNull();
    expect(resolved.branding.logo_url).toBeNull();
  });

  it('preserves Internal ui_plan (KPIs, charts, filters, lead card layout)', () => {
    const ui = resolved.ui_plan!;
    expect(ui.dashboard_emphasis).toBe('velocity');
    expect(ui.lead_card_layout.primary_fields).toContain('company_name');
    expect(ui.lead_card_layout.primary_fields).toContain('service_category');
    expect(ui.lead_card_layout.primary_fields).toContain('sales_motion');
    expect(ui.lead_card_layout.score_position).toBe('top-right');
    expect(ui.kpis.map((k) => k.metric_id)).toEqual([
      'verified_count_1d',
      'active_motion_pct',
      'avg_score',
      'sources_live',
    ]);
    expect(ui.charts.map((c) => c.metric_id)).toEqual([
      'count_by_category',
      'verified_count',
    ]);
    expect(ui.filters.map((f) => f.field)).toEqual([
      'service_category',
      'sales_motion',
      'federal_registration',
      'source',
    ]);
  });

  it('preserves business_summary (Internal lead_type / problem_solved / what_they_get)', () => {
    const bs = resolved.business_summary!;
    expect(bs.lead_type).toContain('construction-vertical B2B service provider');
    expect(bs.problem_solved.toLowerCase()).toContain('prospect by hand');
    expect(bs.what_they_get.toLowerCase()).toContain('ranked list');
  });

  it('does NOT regress BASE outreach fallbacks for unrelated orgs', () => {
    // Sanity: a fresh BASE merge with an empty partial still yields the
    // platform defaults — Internal must not bleed into the generic baseline.
    const baseline = resolveArchitecture({});
    expect(baseline.outreach.persona).toBe(BASE_ARCHITECTURE.outreach.persona);
    expect(baseline.branding.display_name).toBe(BASE_ARCHITECTURE.branding.display_name);
  });
});
