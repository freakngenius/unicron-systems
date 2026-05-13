// __tests__/config/resolveArchitecture.test.ts — Phase 2C slice 1.
// Spec: SPEC - Phase 2B Tenant Config Layer.md (resolver).

import { describe, expect, it } from 'vitest';
import { BASE_ARCHITECTURE } from '@/lib/config/baseTemplate';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';

describe('resolveArchitecture', () => {
  it('returns BASE_ARCHITECTURE when input is null', () => {
    expect(resolveArchitecture(null)).toEqual(BASE_ARCHITECTURE);
  });

  it('returns BASE_ARCHITECTURE when input is undefined', () => {
    expect(resolveArchitecture(undefined)).toEqual(BASE_ARCHITECTURE);
  });

  it('returns BASE_ARCHITECTURE when input is empty object', () => {
    expect(resolveArchitecture({})).toEqual(BASE_ARCHITECTURE);
  });

  it('overrides top-level vertical', () => {
    const out = resolveArchitecture({ vertical: 'real-estate-investment' });
    expect(out.vertical).toBe('real-estate-investment');
    expect(out.lead_unit).toEqual(BASE_ARCHITECTURE.lead_unit);
  });

  it('shallow-merges lead_unit', () => {
    const out = resolveArchitecture({
      lead_unit: { name: 'deal', plural: 'deals', schema: {} },
    });
    expect(out.lead_unit.name).toBe('deal');
    expect(out.lead_unit.plural).toBe('deals');
  });

  it('preserves base lead_unit when override missing fields', () => {
    const out = resolveArchitecture({
      lead_unit: { name: 'project' },
    } as Parameters<typeof resolveArchitecture>[0]);
    expect(out.lead_unit.name).toBe('project');
    expect(out.lead_unit.plural).toBe(BASE_ARCHITECTURE.lead_unit.plural);
  });

  it('shallow-merges scoring with overrides', () => {
    const out = resolveArchitecture({
      scoring: { weights: { trigger_strength: 0.5 }, thresholds: { verified: 0.7, high_priority: 0.9 } },
    });
    expect(out.scoring.weights).toEqual({ trigger_strength: 0.5 });
    expect(out.scoring.thresholds.verified).toBe(0.7);
    expect(out.scoring.thresholds.high_priority).toBe(0.9);
  });

  it('shallow-merges geography defaults', () => {
    const out = resolveArchitecture({
      geography: { scope: 'metros', defaults: ['Phoenix', 'Denver', 'Boise'] },
    });
    expect(out.geography.defaults).toEqual(['Phoenix', 'Denver', 'Boise']);
    expect(out.geography.scope).toBe('metros');
  });

  it('shallow-merges vocabulary additively', () => {
    const out = resolveArchitecture({
      vocabulary: { lead: 'deal', leads: 'deals' },
    });
    expect(out.vocabulary.lead).toBe('deal');
    expect(out.vocabulary.leads).toBe('deals');
  });

  it('overrides branding while keeping defaults for missing fields', () => {
    const out = resolveArchitecture({
      branding: { display_name: 'Realberry', accent_color: '#1a4d3a' },
    });
    expect(out.branding.display_name).toBe('Realberry');
    expect(out.branding.accent_color).toBe('#1a4d3a');
  });

  it('preserves base outreach when not overridden', () => {
    const out = resolveArchitecture({ vertical: 'x' });
    expect(out.outreach.persona).toBe(BASE_ARCHITECTURE.outreach.persona);
  });

  it('replaces sources array entirely (not merged)', () => {
    const out = resolveArchitecture({
      sources: [
        { id: 'sec-edgar', type: 'registered' },
        { id: 'rentcafe', type: 'pending' },
      ],
    });
    expect(out.sources).toHaveLength(2);
    expect(out.sources[0]?.id).toBe('sec-edgar');
  });

  it('replaces compliance array entirely (not merged)', () => {
    const out = resolveArchitecture({ compliance: ['SEC', 'accredited-investor'] });
    expect(out.compliance).toEqual(['SEC', 'accredited-investor']);
  });

  it('does not mutate the input partial', () => {
    const partial = { vertical: 'real-estate' };
    const before = JSON.stringify(partial);
    resolveArchitecture(partial);
    expect(JSON.stringify(partial)).toBe(before);
  });

  // Build-Out Pass Slice 1 — Architect emits ui_plan.
  // Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
  describe('ui_plan (Build-Out Pass Slice 1)', () => {
    it('BASE_ARCHITECTURE carries a safe default ui_plan with volume emphasis', () => {
      expect(BASE_ARCHITECTURE.ui_plan).toBeDefined();
      expect(BASE_ARCHITECTURE.ui_plan?.dashboard_emphasis).toBe('volume');
      expect(BASE_ARCHITECTURE.ui_plan?.lead_card_layout.primary_fields).toEqual([]);
      expect(BASE_ARCHITECTURE.ui_plan?.kpis).toEqual([]);
      expect(BASE_ARCHITECTURE.ui_plan?.charts).toEqual([]);
      expect(BASE_ARCHITECTURE.ui_plan?.filters).toEqual([]);
    });

    it('returns base ui_plan when partial omits it', () => {
      const out = resolveArchitecture({ vertical: 'x' });
      expect(out.ui_plan).toEqual(BASE_ARCHITECTURE.ui_plan);
    });

    it('shallow-merges ui_plan field-by-field with base defaults', () => {
      const out = resolveArchitecture({
        ui_plan: {
          dashboard_emphasis: 'coverage',
          lead_card_layout: {
            primary_fields: ['name', 'asset_class', 'score'],
            secondary_fields: ['source'],
            score_position: 'top-right',
          },
          kpis: [{ label: 'Leads this week', metric_id: 'leads_weekly' }],
          charts: [],
          filters: [],
        },
      });
      expect(out.ui_plan?.dashboard_emphasis).toBe('coverage');
      expect(out.ui_plan?.lead_card_layout.primary_fields).toEqual([
        'name',
        'asset_class',
        'score',
      ]);
      expect(out.ui_plan?.kpis).toHaveLength(1);
      expect(out.ui_plan?.kpis?.[0]?.metric_id).toBe('leads_weekly');
    });
  });
});
