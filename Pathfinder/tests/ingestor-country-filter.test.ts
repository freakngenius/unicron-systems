// tests/ingestor-country-filter.test.ts — Demo Polish P1 ingestor
// Layer A unit test. Verifies applyCountryFilter mutates the record's
// country/rejection_reason fields exactly as expected against the
// org_geo_config allow-list.

import { describe, expect, it } from 'vitest';
import { applyCountryFilter, type IngestorRecord } from '@/lib/ingestor';

function fixture(overrides: Partial<IngestorRecord>): IngestorRecord {
  return {
    id: 'test:1',
    source: 'sam.gov',
    source_id: '1',
    title: 'Test',
    summary: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: {},
    lat: null,
    lon: null,
    country: null,
    rejection_reason: null,
    rejected_at: null,
    ...overrides,
  };
}

describe('applyCountryFilter', () => {
  it('passes US sam.gov records through', () => {
    const r = fixture({
      raw_payload: { placeOfPerformance: { state: { code: 'TN' } } },
    });
    const result = applyCountryFilter(r, ['USA', 'CAN']);
    expect(result.rejected).toBe(false);
    expect(r.country).toBe('USA');
    expect(r.rejection_reason).toBeNull();
  });

  it('rejects Romania sam.gov records', () => {
    const r = fixture({
      raw_payload: {
        placeOfPerformance: {
          country: { code: 'ROU', name: 'ROMANIA' },
        },
      },
    });
    const result = applyCountryFilter(r, ['USA', 'CAN']);
    expect(result.rejected).toBe(true);
    expect(r.country).toBe('ROU');
    expect(r.rejection_reason).toBe('out_of_country');
    expect(r.rejected_at).toBeTruthy();
  });

  it('passes Canada records when CAN is allowed', () => {
    const r = fixture({
      raw_payload: { recipient: { location: { country_code: 'CAN' } } },
    });
    const result = applyCountryFilter(r, ['USA', 'CAN']);
    expect(result.rejected).toBe(false);
    expect(r.country).toBe('CAN');
  });

  it('lets unknown-country payloads through unchanged', () => {
    const r = fixture({ raw_payload: { weird_shape: true } });
    const result = applyCountryFilter(r, ['USA', 'CAN']);
    expect(result.rejected).toBe(false);
    expect(r.country).toBeNull();
    expect(r.rejection_reason).toBeNull();
  });

  it('rejects when allow-list does not include detected country', () => {
    // Even if Canada appears, a US-only org rejects it.
    const r = fixture({
      raw_payload: { recipient: { location: { country_code: 'CAN' } } },
    });
    const result = applyCountryFilter(r, ['USA']);
    expect(result.rejected).toBe(true);
    expect(r.rejection_reason).toBe('out_of_country');
  });
});
