// __tests__/agents/funder-qualifier-geo.test.ts
// Funder onboarding Stage 4 — qualifier + geo hub assignment tests.

import { describe, it, expect } from 'vitest';
import { qualifyForFunder } from '@/lib/agents/funder/qualifier';
import { assignHub } from '@/lib/agents/funder/geo';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import funderFixture from '../fixtures/funder-architecture.json';

const { _comment: _x, ...funderInput } = funderFixture as unknown as Record<string, unknown>;
const FUNDER_ARCH = resolveArchitecture(funderInput);

describe('Funder qualifier', () => {
  it('passes ProPublica source-trusted events with thesis_match', () => {
    const r = qualifyForFunder({
      source_event_id: 'propublica:1',
      source: 'custom-propublica-nonprofit-explorer',
      title: 'Test AI Safety Org',
      summary: null,
      raw_payload: { thesis_match: 'ai-safety' },
      architecture: FUNDER_ARCH,
    });
    expect(r.qualified).toBe(true);
    expect(r.inferred_thesis).toBe('ai-safety');
  });

  it('passes IRS source-trusted events', () => {
    const r = qualifyForFunder({
      source_event_id: 'irs:1',
      source: 'custom-irs-exempt-org-filings',
      title: 'New Foundation',
      summary: null,
      raw_payload: {},
      architecture: FUNDER_ARCH,
    });
    expect(r.qualified).toBe(true);
    expect(r.reason).toContain('source-trusted');
  });

  it('flags biosecurity matches with compliance flag', () => {
    const r = qualifyForFunder({
      source_event_id: 'ea-forum:1',
      source: 'custom-ea-forum-rss',
      title: 'New Pandemic Preparedness Initiative',
      summary: 'Working on biosecurity research and pathogen surveillance.',
      raw_payload: {},
      architecture: FUNDER_ARCH,
    });
    expect(r.qualified).toBe(true);
    expect(r.inferred_thesis).toBe('biosecurity');
    expect(r.compliance_flag).toBe('biosecurity-review');
  });

  it('passes EA Forum events with AI safety keyword match', () => {
    const r = qualifyForFunder({
      source_event_id: 'ea-forum:2',
      source: 'custom-ea-forum-rss',
      title: 'Announcing alignment research grant program',
      summary: 'Funding AI safety projects.',
      raw_payload: {},
      architecture: FUNDER_ARCH,
    });
    expect(r.qualified).toBe(true);
    expect(r.inferred_thesis).toBe('ai-safety');
    expect(r.compliance_flag).toBeFalsy();
  });

  it('drops obvious noise (real estate)', () => {
    const r = qualifyForFunder({
      source_event_id: 'rss:3',
      source: 'custom-philanthropy-trade-press-rss',
      title: 'Real estate development project closes funding',
      summary: 'Condominium development in SF.',
      raw_payload: {},
      architecture: FUNDER_ARCH,
    });
    expect(r.qualified).toBe(false);
    expect(r.reason).toContain('noise:');
  });

  it('drops RSS events with no thesis keyword match', () => {
    const r = qualifyForFunder({
      source_event_id: 'rss:4',
      source: 'custom-philanthropy-trade-press-rss',
      title: 'Annual gala recap',
      summary: 'Highlights from this year\'s celebration.',
      raw_payload: {},
      architecture: FUNDER_ARCH,
    });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('no_thesis_keyword_match');
  });

  it('treats funder-990 events as enrichment context', () => {
    const r = qualifyForFunder({
      source_event_id: 'funder-990:1',
      source: 'custom-funder-990-filings',
      title: 'Open Philanthropy 2023 990 filing',
      summary: '',
      raw_payload: {},
      architecture: FUNDER_ARCH,
    });
    expect(r.qualified).toBe(true);
    expect(r.reason).toBe('enrichment-context:peer-funder-990');
  });
});

describe('Funder geo hub assignment', () => {
  it('assigns sf-bay for Bay Area cities', () => {
    expect(assignHub({ city: 'San Francisco', state: 'CA' })).toBe('sf-bay');
    expect(assignHub({ city: 'Berkeley', state: 'CA' })).toBe('sf-bay');
    expect(assignHub({ city: 'Palo Alto', state: 'CA' })).toBe('sf-bay');
  });

  it('assigns nyc for NYC boroughs', () => {
    expect(assignHub({ city: 'New York', state: 'NY' })).toBe('nyc');
    expect(assignHub({ city: 'Brooklyn', state: 'NY' })).toBe('nyc');
    expect(assignHub({ city: 'Jersey City', state: 'NJ' })).toBe('nyc');
  });

  it('assigns dc-metro for the DC region', () => {
    expect(assignHub({ city: 'Washington', state: 'DC' })).toBe('dc-metro');
    expect(assignHub({ city: 'Arlington', state: 'VA' })).toBe('dc-metro');
    expect(assignHub({ city: 'Bethesda', state: 'MD' })).toBe('dc-metro');
  });

  it('assigns boston for Cambridge / Somerville', () => {
    expect(assignHub({ city: 'Cambridge', state: 'MA' })).toBe('boston');
    expect(assignHub({ city: 'Boston', state: 'MA' })).toBe('boston');
  });

  it('assigns london for London UK', () => {
    expect(assignHub({ city: 'London', country: 'GBR' })).toBe('london');
    expect(assignHub({ city: 'London', country: 'United Kingdom' })).toBe('london');
  });

  it('falls back to remote when no city or state', () => {
    expect(assignHub({})).toBe('remote');
  });

  it('falls back to other for unknown locations', () => {
    expect(assignHub({ city: 'Detroit', state: 'MI' })).toBe('other');
    expect(assignHub({ city: 'Phoenix', state: 'AZ' })).toBe('other');
  });
});
