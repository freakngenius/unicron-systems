// __tests__/catalog/modules/smart-search/applySearch.test.ts, Stream F.
//
// Pure narrowing helper for the one smart-search input. Tokenized AND
// against company name, service category, sales motion, hq state (name
// AND abbreviation), and the numeric score. An empty / whitespace q
// returns the input unchanged.

import { describe, it, expect } from 'vitest';
import { applySearchQuery } from '@/lib/catalog/modules/smart-search/applySearch';
import type { RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';

function row(id: string, fields: Partial<RawCompanyRow> = {}): RawCompanyRow {
  return {
    id,
    organization_id: 'internal-id',
    score: 55,
    title: id,
    source: 'sam-gov',
    raw_payload: {
      internal_enrichment: {
        company_name: id,
        service_category: 'equipment-rental',
        sales_motion: 'active-outbound',
        hq_location: 'Houston, Texas',
      },
    },
    ...fields,
  };
}

describe('applySearchQuery', () => {
  it('returns rows unchanged when q is empty or whitespace', () => {
    const rows = [row('a'), row('b')];
    expect(applySearchQuery(rows, '').map((r) => r.id)).toEqual(['a', 'b']);
    expect(applySearchQuery(rows, '   ').map((r) => r.id)).toEqual(['a', 'b']);
    expect(applySearchQuery(rows, undefined).map((r) => r.id)).toEqual(['a', 'b']);
    expect(applySearchQuery(rows, null).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('matches a case-insensitive substring of the company name', () => {
    const rows = [
      row('manson-construction', {
        title: 'Manson Construction Co',
        raw_payload: {
          internal_enrichment: { company_name: 'Manson Construction Co' },
        },
      }),
      row('thalle', {
        title: 'Thalle Construction Co Inc',
        raw_payload: { internal_enrichment: { company_name: 'Thalle Construction Co Inc' } },
      }),
    ];
    expect(applySearchQuery(rows, 'thalle').map((r) => r.id)).toEqual(['thalle']);
    expect(applySearchQuery(rows, 'CONSTRUCTION').map((r) => r.id)).toEqual(['manson-construction', 'thalle']);
  });

  it('matches the service category by slug AND humanized label', () => {
    const rows = [
      row('a', { raw_payload: { internal_enrichment: { service_category: 'equipment-rental' } } }),
      row('b', { raw_payload: { internal_enrichment: { service_category: 'temp-fence' } } }),
    ];
    expect(applySearchQuery(rows, 'equipment-rental').map((r) => r.id)).toEqual(['a']);
    expect(applySearchQuery(rows, 'equipment rental').map((r) => r.id)).toEqual(['a']);
    expect(applySearchQuery(rows, 'equipment').map((r) => r.id)).toEqual(['a']);
    expect(applySearchQuery(rows, 'fence').map((r) => r.id)).toEqual(['b']);
  });

  it('matches the sales motion by slug AND humanized label', () => {
    const rows = [
      row('a', { raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } } }),
      row('b', { raw_payload: { internal_enrichment: { sales_motion: 'hiring-bd' } } }),
    ];
    expect(applySearchQuery(rows, 'active-outbound').map((r) => r.id)).toEqual(['a']);
    expect(applySearchQuery(rows, 'active outbound').map((r) => r.id)).toEqual(['a']);
    expect(applySearchQuery(rows, 'hiring').map((r) => r.id)).toEqual(['b']);
  });

  it('matches the hq state by full name and by 2-letter abbreviation', () => {
    const rows = [
      row('tx', {
        raw_payload: { internal_enrichment: { hq_location: 'Houston, Texas' } },
      }),
      row('ny', {
        raw_payload: { internal_enrichment: { hq_location: 'New York, NY' } },
      }),
      row('ca', {
        raw_payload: { internal_enrichment: { hq_location: 'San Diego, California' } },
      }),
    ];
    expect(applySearchQuery(rows, 'Texas').map((r) => r.id)).toEqual(['tx']);
    expect(applySearchQuery(rows, 'TX').map((r) => r.id)).toEqual(['tx']);
    expect(applySearchQuery(rows, 'CA').map((r) => r.id)).toEqual(['ca']);
    expect(applySearchQuery(rows, 'California').map((r) => r.id)).toEqual(['ca']);
    expect(applySearchQuery(rows, 'NY').map((r) => r.id)).toEqual(['ny']);
  });

  it('matches the numeric score as a string', () => {
    const rows = [
      row('a', { score: 55 }),
      row('b', { score: 80 }),
      row('c', { score: 12 }),
    ];
    expect(applySearchQuery(rows, '55').map((r) => r.id)).toEqual(['a']);
    expect(applySearchQuery(rows, '8').map((r) => r.id)).toEqual(['b']);
  });

  it('AND-combines multiple tokens (every token must match SOME field)', () => {
    const rows = [
      row('manson-tx', {
        title: 'Manson Construction',
        raw_payload: {
          internal_enrichment: {
            company_name: 'Manson Construction',
            service_category: 'equipment-rental',
            hq_location: 'Houston, Texas',
          },
        },
      }),
      row('manson-ny', {
        title: 'Manson NYC',
        raw_payload: {
          internal_enrichment: {
            company_name: 'Manson NYC',
            service_category: 'equipment-rental',
            hq_location: 'New York, NY',
          },
        },
      }),
    ];
    expect(applySearchQuery(rows, 'Manson Texas').map((r) => r.id)).toEqual(['manson-tx']);
    expect(applySearchQuery(rows, 'manson TX').map((r) => r.id)).toEqual(['manson-tx']);
    // A token that matches nothing kills the row.
    expect(applySearchQuery(rows, 'manson fence').map((r) => r.id)).toEqual([]);
  });

  it('falls back to row.title when raw_payload.internal_enrichment.company_name is absent', () => {
    const rows = [
      row('a', {
        title: 'Acme Roofing',
        raw_payload: { internal_enrichment: {} },
      }),
    ];
    expect(applySearchQuery(rows, 'acme').map((r) => r.id)).toEqual(['a']);
  });
});
