// __tests__/catalog/internalSignals.test.ts, Stream C Detail surface.
//
// Asserts the qualitative signal extraction: each signal carries its
// architecture weight and the real stored evidence that fired it. Never
// a fabricated numeric contribution.

import { describe, expect, it } from 'vitest';

import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';
import {
  extractInternalSignals,
  formatWeightPercent,
} from '@/lib/catalog/internalSignals';

function makeLead(overrides: Partial<CompanyLeadView> = {}): CompanyLeadView {
  return {
    id: 'proj-1',
    company_name: 'Thalle Construction Co Inc',
    score: 55,
    verified: false,
    service_category: 'General contractor',
    sales_motion: 'Active outbound',
    footprint: 'HQ NY · ops NY / NJ / PA',
    hq_location: 'White Plains, NY',
    employee_count: 750,
    federal_registration: 'SAM + awardee',
    associations: ['ABC', 'AGC', 'ENR Top 600'],
    source: 'sam-gov',
    posted_date: '2026-05-22T00:00:00Z',
    warm_intro: null,
    first_step: 'send the day-1 pitch',
    rationale: 'Active outbound posture, multi-state ops, federal awardee.',
    brief: null,
    citations: [],
    website: 'https://thalle.com',
    linkedin: null,
    contacts: [],
    ...overrides,
  };
}

const FULL_PAYLOAD = {
  internal_geo: {
    hq_state: 'NY',
    hq_city: 'White Plains',
    operating_states: ['NY', 'NJ', 'PA'],
  },
  internal_sales_motion_signal: 'BD director posting on LinkedIn',
  internal_inferred_service_category: 'general-contractor',
};

describe('extractInternalSignals', () => {
  it('returns six entries in weight-descending order', () => {
    const signals = extractInternalSignals(makeLead(), FULL_PAYLOAD);
    expect(signals).toHaveLength(6);
    expect(signals.map((s) => s.id)).toEqual([
      'sales_motion_strength',
      'operational_footprint',
      'federal_signal',
      'project_driven_fit',
      'recency',
      'association_presence',
    ]);
    const weights = signals.map((s) => s.weight);
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i]).toBeLessThanOrEqual(weights[i - 1]);
    }
  });

  it('uses the canonical architecture weights as unit fractions', () => {
    const signals = extractInternalSignals(makeLead(), FULL_PAYLOAD);
    const byId = Object.fromEntries(signals.map((s) => [s.id, s.weight]));
    expect(byId.sales_motion_strength).toBe(0.25);
    expect(byId.operational_footprint).toBe(0.2);
    expect(byId.federal_signal).toBe(0.15);
    expect(byId.project_driven_fit).toBe(0.15);
    expect(byId.recency).toBe(0.15);
    expect(byId.association_presence).toBe(0.1);
  });

  it('NEVER emits a numeric contribution field', () => {
    const signals = extractInternalSignals(makeLead(), FULL_PAYLOAD);
    for (const s of signals) {
      const keys = Object.keys(s);
      expect(keys).toEqual(['id', 'label', 'weight', 'evidence']);
      // Defensive: no "contribution" / "value" / "calibrated" leaks.
      expect(keys).not.toContain('contribution');
      expect(keys).not.toContain('value');
      expect(keys).not.toContain('calibrated');
      expect(keys).not.toContain('points');
    }
  });

  it('produces real evidence strings for the full Thalle-like fixture', () => {
    const signals = extractInternalSignals(makeLead(), FULL_PAYLOAD);
    const byId = Object.fromEntries(signals.map((s) => [s.id, s.evidence]));
    expect(byId.sales_motion_strength).toContain('Active outbound');
    expect(byId.operational_footprint).toContain('HQ NY');
    expect(byId.operational_footprint).toContain('NY / NJ / PA');
    expect(byId.federal_signal).toContain('SAM + awardee');
    expect(byId.project_driven_fit).toContain('General contractor');
    expect(byId.recency).toMatch(/^Posted \d{4}-\d{2}-\d{2}$/);
    expect(byId.association_presence).toContain('3 memberships');
    expect(byId.association_presence).toContain('ABC');
  });

  it('renders empty evidence rather than fabricating when fields are missing', () => {
    const sparse = makeLead({
      sales_motion: null,
      federal_registration: 'None',
      associations: [],
      posted_date: null,
      service_category: null,
    });
    const signals = extractInternalSignals(sparse, {});
    const byId = Object.fromEntries(signals.map((s) => [s.id, s.evidence]));
    expect(byId.sales_motion_strength).toBe('');
    expect(byId.operational_footprint).toBe('');
    expect(byId.federal_signal).toBe('');
    expect(byId.project_driven_fit).toBe('');
    expect(byId.recency).toBe('');
    expect(byId.association_presence).toBe('');
  });

  it('drops "None" federal registration to empty evidence (case-insensitive)', () => {
    for (const value of ['None', 'none', 'NONE']) {
      const signals = extractInternalSignals(makeLead({ federal_registration: value }), {});
      const fed = signals.find((s) => s.id === 'federal_signal')!;
      expect(fed.evidence).toBe('');
    }
  });

  it('uses HQ state alone when no operating_states are present', () => {
    const signals = extractInternalSignals(makeLead(), {
      internal_geo: { hq_state: 'TX' },
    });
    const fp = signals.find((s) => s.id === 'operational_footprint')!;
    expect(fp.evidence).toBe('HQ TX');
  });

  it('truncates footprint to 4 states + remainder count when many', () => {
    const signals = extractInternalSignals(makeLead(), {
      internal_geo: {
        hq_state: 'TX',
        operating_states: ['TX', 'OK', 'AR', 'LA', 'NM', 'KS', 'CO'],
      },
    });
    const fp = signals.find((s) => s.id === 'operational_footprint')!;
    expect(fp.evidence).toContain('TX / OK / AR / LA');
    expect(fp.evidence).toContain('+3');
  });

  it('appends the qualifier sales-motion hint when distinct from the projected motion', () => {
    const signals = extractInternalSignals(makeLead({ sales_motion: 'Active outbound' }), {
      internal_sales_motion_signal: 'BD director hiring',
    });
    const sm = signals.find((s) => s.id === 'sales_motion_strength')!;
    expect(sm.evidence).toContain('Active outbound');
    expect(sm.evidence).toContain('signal: BD director hiring');
  });

  it('formats posted_date as ISO yyyy-mm-dd', () => {
    const signals = extractInternalSignals(makeLead({ posted_date: '2026-05-22T17:00:00Z' }), {});
    const recency = signals.find((s) => s.id === 'recency')!;
    expect(recency.evidence).toBe('Posted 2026-05-22');
  });

  it('summarizes single-membership association correctly (singular)', () => {
    const signals = extractInternalSignals(makeLead({ associations: ['AGC'] }), {});
    const a = signals.find((s) => s.id === 'association_presence')!;
    expect(a.evidence).toBe('1 membership: AGC');
  });

  it('handles null raw_payload without throwing', () => {
    expect(() => extractInternalSignals(makeLead(), null)).not.toThrow();
    expect(() => extractInternalSignals(makeLead(), undefined)).not.toThrow();
  });
});

describe('formatWeightPercent', () => {
  it('renders unit-fraction weights as percent strings', () => {
    expect(formatWeightPercent(0.25)).toBe('25%');
    expect(formatWeightPercent(0.2)).toBe('20%');
    expect(formatWeightPercent(0.15)).toBe('15%');
    expect(formatWeightPercent(0.1)).toBe('10%');
  });
});
