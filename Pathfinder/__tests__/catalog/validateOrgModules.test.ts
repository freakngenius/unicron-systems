// __tests__/catalog/validateOrgModules.test.ts, Stream A Foundation.

import { describe, expect, it } from 'vitest';
import {
  MODULE_REGISTRY,
  validateOrgModules,
  type OrgModulesBlock,
} from '@/lib/catalog';

// Architecture fixture matching Internal (#4): lead_unit.schema.score present,
// integrations include hubspot/slack/resend. Enough for the synchronous
// hard-gate checks the validator performs.
const INTERNAL_FIXTURE = {
  lead_unit: {
    name: 'company',
    plural: 'companies',
    schema: {
      score: { type: 'number' as const, display_label: 'Score' },
      service_category: { type: 'enum' as const, display_label: 'Service category' },
      sales_motion: { type: 'enum' as const, display_label: 'Sales motion' },
      federal_registration: { type: 'enum' as const, display_label: 'Federal registration' },
      source: { type: 'string' as const, display_label: 'Source' },
    },
  },
  integrations: ['hubspot', 'slack', 'resend'],
};

const INTERNAL_MODULES: OrgModulesBlock = {
  'ranked-feed': { enabled: true },
  'company-detail': { enabled: true },
  'outreach-composer': { enabled: true },
  'hubspot-sync': { enabled: true },
  'pipeline-kanban': { enabled: true },
  'filter-rail': { enabled: true },
  'warm-intro-panel': { enabled: true },
  'daily-digest': { enabled: true },
  'kpi-strip': {
    enabled: true,
    config: { metrics: ['verified_count_1d', 'active_motion_pct', 'avg_score', 'sources_live'] },
  },
  'analytics-charts': { enabled: true, config: { emphasis: 'secondary' } },
  'geo-map': { enabled: false },
};

describe('validateOrgModules', () => {
  it('accepts the Internal modules block against the Internal architecture', () => {
    const r = validateOrgModules({ ...INTERNAL_FIXTURE, modules: INTERNAL_MODULES });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects an unknown module id', () => {
    const modules = { ...INTERNAL_MODULES, 'not-a-module': { enabled: true } } as unknown as OrgModulesBlock;
    const r = validateOrgModules({ ...INTERNAL_FIXTURE, modules });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'unknown_module_id' && e.moduleId === 'not-a-module')).toBe(true);
  });

  it('rejects two enabled slot-claiming modules colliding on the same slot', () => {
    // Force a collision by enabling geo-map (also slot=detail.body) alongside company-detail.
    const r = validateOrgModules({
      ...INTERNAL_FIXTURE,
      modules: { ...INTERNAL_MODULES, 'geo-map': { enabled: true } },
    });
    expect(r.ok).toBe(false);
    expect(
      r.errors.some(
        (e) => e.code === 'slot_collision' && e.slot === 'detail.body',
      ),
    ).toBe(true);
  });

  it('allows hubspot-sync (action-affordance) alongside outreach-composer on detail.outreach', () => {
    // The action-affordance slotMode exempts hubspot-sync from the collision
    // check even though it shares detail.outreach with outreach-composer.
    const r = validateOrgModules({
      ...INTERNAL_FIXTURE,
      modules: {
        'outreach-composer': { enabled: true },
        'hubspot-sync': { enabled: true },
      },
    });
    expect(
      r.errors.some(
        (e) => e.code === 'slot_collision' && e.slot === 'detail.outreach',
      ),
    ).toBe(false);
  });

  it('rejects a pinned version that does not match the registry', () => {
    const r = validateOrgModules({
      ...INTERNAL_FIXTURE,
      modules: { 'ranked-feed': { enabled: true, version: '99.0.0' } },
    });
    expect(r.errors.some((e) => e.code === 'pinned_version_missing' && e.moduleId === 'ranked-feed')).toBe(true);
  });

  it('rejects a configSchema failure (kpi-strip without metrics)', () => {
    const r = validateOrgModules({
      ...INTERNAL_FIXTURE,
      modules: { 'kpi-strip': { enabled: true, config: { metrics: [] } } },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'config_schema_failure' && e.moduleId === 'kpi-strip')).toBe(true);
  });

  it('rejects a hard integration gate unmet (hubspot-sync without hubspot in integrations)', () => {
    const r = validateOrgModules({
      ...INTERNAL_FIXTURE,
      integrations: ['slack'], // hubspot removed
      modules: { 'hubspot-sync': { enabled: true } },
    });
    expect(r.errors.some((e) => e.code === 'hard_gate_unmet' && e.moduleId === 'hubspot-sync')).toBe(true);
  });

  it('rejects a hard schema_field gate unmet (ranked-feed without score in schema)', () => {
    const r = validateOrgModules({
      ...INTERNAL_FIXTURE,
      lead_unit: { ...INTERNAL_FIXTURE.lead_unit, schema: { source: { type: 'string' as const } } },
      modules: { 'ranked-feed': { enabled: true } },
    });
    expect(r.errors.some((e) => e.code === 'hard_gate_unmet' && e.moduleId === 'ranked-feed')).toBe(true);
  });

  it('treats disabled entries as no-ops', () => {
    const r = validateOrgModules({
      ...INTERNAL_FIXTURE,
      integrations: [], // would fail hard gates if enabled
      modules: {
        'hubspot-sync': { enabled: false },
        'daily-digest': { enabled: false },
      },
    });
    expect(r.ok).toBe(true);
  });

  it('skips sync hard-gate enforcement when enforceSyncHardGates=false', () => {
    const r = validateOrgModules(
      {
        ...INTERNAL_FIXTURE,
        integrations: [],
        modules: { 'hubspot-sync': { enabled: true } },
      },
      { enforceSyncHardGates: false },
    );
    expect(r.errors.some((e) => e.code === 'hard_gate_unmet')).toBe(false);
  });
});

describe('MODULE_REGISTRY shape', () => {
  it('registers exactly the eleven module ids', () => {
    expect(Object.keys(MODULE_REGISTRY).sort()).toEqual([
      'analytics-charts',
      'company-detail',
      'daily-digest',
      'filter-rail',
      'geo-map',
      'hubspot-sync',
      'kpi-strip',
      'outreach-composer',
      'pipeline-kanban',
      'ranked-feed',
      'warm-intro-panel',
    ]);
  });

  it('marks hubspot-sync as an action-affordance on detail.outreach', () => {
    expect(MODULE_REGISTRY['hubspot-sync'].slot).toBe('detail.outreach');
    expect(MODULE_REGISTRY['hubspot-sync'].slotMode).toBe('action-affordance');
  });

  it('places geo-map on detail.body with hidden fallback', () => {
    expect(MODULE_REGISTRY['geo-map'].slot).toBe('detail.body');
    expect(MODULE_REGISTRY['geo-map'].fallback).toBe('hidden');
  });
});
