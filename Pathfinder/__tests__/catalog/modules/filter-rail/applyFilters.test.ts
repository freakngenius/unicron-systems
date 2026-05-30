// __tests__/catalog/modules/filter-rail/applyFilters.test.ts, Stream B.
//
// Pure helper used by ranked-feed (Module 1) and filter-rail (Module 2).
// Narrows a raw Project[] by the four configured filters before the rows
// are projected into the company-card view. Working against raw rows
// keeps the filter on the enum-slug values the schema declares (e.g.
// 'active-outbound') rather than the humanized label ('Active outbound').

import { describe, it, expect } from 'vitest';
import { applyFilters, type RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';

function row(id: string, fields: Partial<RawCompanyRow> = {}): RawCompanyRow {
  return {
    id,
    organization_id: 'internal-id',
    score: 70,
    title: id,
    source: 'sam-gov',
    raw_payload: {
      internal_enrichment: { service_category: 'equipment-rental', sales_motion: 'active-outbound' },
      internal_federal_registration: 'sam-registered',
    },
    ...fields,
  };
}

describe('applyFilters', () => {
  it('returns rows unchanged when no filters are set', () => {
    const rows = [row('a'), row('b'), row('c')];
    expect(applyFilters(rows, {}).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('narrows by service_category against raw_payload.internal_enrichment.service_category', () => {
    const rows = [
      row('a', { raw_payload: { internal_enrichment: { service_category: 'equipment-rental' } } }),
      row('b', { raw_payload: { internal_enrichment: { service_category: 'temp-fence' } } }),
      row('c', { raw_payload: { internal_enrichment: { service_category: 'crane-rental' } } }),
    ];
    expect(applyFilters(rows, { service_category: 'temp-fence' }).map((r) => r.id)).toEqual(['b']);
  });

  it('narrows by sales_motion against raw_payload.internal_enrichment.sales_motion', () => {
    const rows = [
      row('a', { raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } } }),
      row('b', { raw_payload: { internal_enrichment: { sales_motion: 'inbound-only' } } }),
    ];
    expect(applyFilters(rows, { sales_motion: 'active-outbound' }).map((r) => r.id)).toEqual(['a']);
  });

  it('narrows by federal_registration against raw_payload.internal_federal_registration', () => {
    const rows = [
      row('a', { raw_payload: { internal_federal_registration: 'sam-registered' } }),
      row('b', { raw_payload: { internal_federal_registration: 'none' } }),
    ];
    expect(applyFilters(rows, { federal_registration: 'sam-registered' }).map((r) => r.id)).toEqual([
      'a',
    ]);
  });

  it('narrows by source against the top-level source column', () => {
    const rows = [row('a', { source: 'sam-gov' }), row('b', { source: 'usaspending' })];
    expect(applyFilters(rows, { source: 'usaspending' }).map((r) => r.id)).toEqual(['b']);
  });

  it('AND-combines multiple filters', () => {
    const rows = [
      row('a', {
        source: 'sam-gov',
        raw_payload: { internal_enrichment: { service_category: 'equipment-rental' } },
      }),
      row('b', {
        source: 'sam-gov',
        raw_payload: { internal_enrichment: { service_category: 'temp-fence' } },
      }),
      row('c', {
        source: 'usaspending',
        raw_payload: { internal_enrichment: { service_category: 'equipment-rental' } },
      }),
    ];
    const out = applyFilters(rows, { source: 'sam-gov', service_category: 'equipment-rental' });
    expect(out.map((r) => r.id)).toEqual(['a']);
  });

  it('treats a missing nested field as a non-match (filter narrows it out)', () => {
    const rows = [
      row('a', { raw_payload: { internal_enrichment: {} } }),
      row('b', { raw_payload: null as any }),
      row('c'),
    ];
    expect(applyFilters(rows, { service_category: 'equipment-rental' }).map((r) => r.id)).toEqual([
      'c',
    ]);
  });

  it('ignores empty-string filter values (means "all")', () => {
    const rows = [row('a'), row('b')];
    expect(applyFilters(rows, { service_category: '' }).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
