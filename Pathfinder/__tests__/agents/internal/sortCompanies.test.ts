// __tests__/agents/internal/sortCompanies.test.ts, Stream E (Internal V2).
//
// Pure-function tests for the Companies-route sort helpers.

import { describe, it, expect } from 'vitest';
import {
  parseSortKey,
  sortCompanies,
  SORT_KEYS,
} from '@/lib/agents/internal/sortCompanies';
import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';

function row(overrides: Partial<CompanyLeadView>): CompanyLeadView {
  return {
    id: 'r',
    company_name: 'Company',
    score: 0,
    verified: false,
    service_category: null,
    sales_motion: null,
    footprint: null,
    hq_location: null,
    employee_count: null,
    federal_registration: null,
    associations: [],
    source: null,
    posted_date: null,
    warm_intro: null,
    first_step: null,
    rationale: null,
    brief: null,
    citations: [],
    website: null,
    linkedin: null,
    contacts: [],
    ...overrides,
  };
}

describe('parseSortKey', () => {
  it('returns score by default for nullish or unknown input', () => {
    expect(parseSortKey(undefined)).toBe('score');
    expect(parseSortKey(null)).toBe('score');
    expect(parseSortKey('')).toBe('score');
    expect(parseSortKey('made-up')).toBe('score');
  });

  it('returns the literal key when it is one of the four allowed', () => {
    for (const key of SORT_KEYS) {
      expect(parseSortKey(key)).toBe(key);
    }
  });
});

describe('sortCompanies', () => {
  const apex = row({ id: 'a', company_name: 'Apex Equipment', service_category: 'Equipment rental', score: 72, verified: true, posted_date: '2026-05-10' });
  const bravo = row({ id: 'b', company_name: 'bravo concrete', service_category: 'Specialty trade', score: 88, verified: false, posted_date: '2026-05-20' });
  const charlie = row({ id: 'c', company_name: 'Charlie Crane', service_category: 'Crane rental', score: 55, verified: true, posted_date: '2026-05-15' });
  const delta = row({ id: 'd', company_name: 'Delta Demo', service_category: null, score: null, verified: false, posted_date: null });

  const rows = [delta, charlie, bravo, apex];

  it('score: score desc, nulls last, verified true breaks ties as first', () => {
    const out = sortCompanies(rows, 'score').map(r => r.id);
    // verified=true sorts before verified=false even when its score is lower
    expect(out[0]).toBe('a'); // apex verified score 72
    expect(out[1]).toBe('c'); // charlie verified score 55
    expect(out[2]).toBe('b'); // bravo unverified score 88
    expect(out[3]).toBe('d'); // delta no score
  });

  it('name: ascending case-insensitive', () => {
    const out = sortCompanies(rows, 'name').map(r => r.id);
    expect(out).toEqual(['a', 'b', 'c', 'd']);
  });

  it('category: ascending by display string, nulls last', () => {
    const out = sortCompanies(rows, 'category').map(r => r.id);
    // Crane rental, Equipment rental, Specialty trade, (null) Delta last
    expect(out).toEqual(['c', 'a', 'b', 'd']);
  });

  it('recent: posted_date desc, nulls last', () => {
    const out = sortCompanies(rows, 'recent').map(r => r.id);
    expect(out).toEqual(['b', 'c', 'a', 'd']);
  });

  it('does not mutate the input array', () => {
    const input = [delta, charlie, bravo, apex];
    sortCompanies(input, 'score');
    expect(input.map(r => r.id)).toEqual(['d', 'c', 'b', 'a']);
  });
});
