// __tests__/agents/internal-qualifier.test.ts
//
// Stage 5 — Internal qualifier expansion.
//
// Validates the per-source structural trust rules + the noise filter +
// the ambiguous-allow path that lets borderline rows reach the verifier.

import { describe, it, expect } from 'vitest';
import { qualifyForInternal } from '@/lib/agents/internal/qualifier';
import type { OrgArchitecture } from '@/lib/types/architecture';

const arch = {
  vertical: 'construction-vertical-b2b-prospecting',
  lead_unit: { name: 'company', plural: 'companies', schema: {} },
  pipeline: { stages: [], stage_labels: {} },
  scoring: { weights: {}, thresholds: { verified: 0.65, high_priority: 0.8 } },
  geography: { scope: 'states', defaults: [] },
  sources: [],
  outreach: { persona: '', tone: '', value_prop: '' },
  vocabulary: {},
  branding: { display_name: 'Unicron Internal' },
  compliance: [],
  integrations: [],
} as unknown as OrgArchitecture;

function input(overrides: Record<string, unknown> = {}) {
  return {
    source_event_id: 'evt-1',
    source: 'sam-gov',
    title: 'Acme Site Services LLC',
    summary: 'Construction services',
    raw_payload: {},
    architecture: arch,
    ...overrides,
  } as const;
}

describe('qualifyForInternal — Stage 5 expansion', () => {
  it('passes a sam-gov entity with construction NAICS', () => {
    const r = qualifyForInternal(input({
      source: 'sam-gov',
      raw_payload: { primary_naics: '238910' },
    }));
    expect(r.qualified).toBe(true);
    expect(r.federal_registration).toBe('sam-registered');
  });

  it('drops a sam-gov entity with non-construction NAICS', () => {
    const r = qualifyForInternal(input({
      source: 'sam-gov',
      raw_payload: { primary_naics: '541512' }, // IT services
    }));
    expect(r.qualified).toBe(false);
  });

  it('passes a usaspending recipient and tags federal_registration', () => {
    const r = qualifyForInternal(input({ source: 'usaspending' }));
    expect(r.qualified).toBe(true);
    expect(r.federal_registration).toBe('federal-awardee');
  });

  it('flags hiring-bd sales motion for a sales-job-posting source', () => {
    const r = qualifyForInternal(input({
      source: 'custom-construction-sales-job-postings',
      title: 'VP of Sales · Acme Construction',
    }));
    expect(r.qualified).toBe(true);
    expect(r.sales_motion_signal).toBe('hiring-bd');
  });

  it('passes an SOS construction entity', () => {
    const r = qualifyForInternal(input({
      source: 'custom-sos-business-registrations',
      title: 'Acme Construction LLC',
      summary: 'New filing',
    }));
    expect(r.qualified).toBe(true);
  });

  it('drops an SOS entity with no construction keyword', () => {
    const r = qualifyForInternal(input({
      source: 'custom-sos-business-registrations',
      title: 'Smith Realty Trust',
      summary: 'New filing',
    }));
    expect(r.qualified).toBe(false);
  });

  it('drops noise (homeowner, realty trust, family trust)', () => {
    const r1 = qualifyForInternal(input({
      source: 'custom-sos-business-registrations',
      title: 'Homeowner Improvement Coop',
    }));
    expect(r1.qualified).toBe(false);
    expect(r1.reason).toContain('noise');

    const r2 = qualifyForInternal(input({
      source: 'sam-gov',
      title: 'Smith Family Trust',
      raw_payload: { primary_naics: '238910' },
    }));
    expect(r2.qualified).toBe(false);
  });

  it('passes a trade-association directory hit and carries association_hint', () => {
    const r = qualifyForInternal(input({
      source: 'custom-trade-association-directories',
      title: 'Acme Construction',
      raw_payload: { association_name: 'ARA' },
    }));
    expect(r.qualified).toBe(true);
    expect(r.association_hint).toBe('ARA');
  });

  it('passes a state-contractor-license event', () => {
    const r = qualifyForInternal(input({
      source: 'custom-state-contractor-licenses',
      title: 'Acme Roofing',
    }));
    expect(r.qualified).toBe(true);
  });

  it('ambiguous-allow: unknown source with construction keyword passes', () => {
    const r = qualifyForInternal(input({
      source: 'totally-unknown-source',
      title: 'Hill Country Construction',
      summary: 'general contractor',
    }));
    expect(r.qualified).toBe(true);
    expect(r.reason).toContain('ambiguous_allow');
    expect(r.sales_motion_signal).toBe('unknown');
  });

  it('default-drop: unknown source with no construction keyword fails', () => {
    const r = qualifyForInternal(input({
      source: 'totally-unknown-source',
      title: 'BrightSky Marketing Group',
      summary: 'SaaS marketing automation',
    }));
    expect(r.qualified).toBe(false);
  });
});
