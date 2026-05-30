// __tests__/catalog/modules/analytics-charts/charts.test.ts, Stream B.
//
// Pure data shapers for the two analytics charts. Tests cover the
// drop-to-empty-state contract: an empty input MUST produce an empty
// series (never a fake bar at zero), so the renderer can switch to the
// designed empty state cleanly.

import { describe, it, expect } from 'vitest';
import { byServiceCategory, verifiedOverTime } from '@/lib/catalog/modules/analytics-charts/charts';

describe('byServiceCategory', () => {
  it('counts rows by raw_payload.internal_enrichment.service_category, sorted desc', () => {
    const rows = [
      { raw_payload: { internal_enrichment: { service_category: 'equipment-rental' } } },
      { raw_payload: { internal_enrichment: { service_category: 'equipment-rental' } } },
      { raw_payload: { internal_enrichment: { service_category: 'equipment-rental' } } },
      { raw_payload: { internal_enrichment: { service_category: 'temp-fence' } } },
      { raw_payload: { internal_enrichment: { service_category: 'crane-rental' } } },
      { raw_payload: { internal_enrichment: { service_category: 'crane-rental' } } },
    ];
    const out = byServiceCategory(rows);
    expect(out).toEqual([
      { slug: 'equipment-rental', count: 3 },
      { slug: 'crane-rental', count: 2 },
      { slug: 'temp-fence', count: 1 },
    ]);
  });

  it('falls back to internal_inferred_service_category when enrichment is absent', () => {
    const rows = [{ raw_payload: { internal_inferred_service_category: 'temp-fence' } }];
    expect(byServiceCategory(rows)).toEqual([{ slug: 'temp-fence', count: 1 }]);
  });

  it('returns an empty array for empty input (let the renderer switch to EmptyState)', () => {
    expect(byServiceCategory([])).toEqual([]);
  });

  it('drops rows with no resolvable category (never bucket as "unknown" into a chart bar)', () => {
    const rows = [
      { raw_payload: { internal_enrichment: { service_category: 'temp-fence' } } },
      { raw_payload: {} },
      { raw_payload: null },
    ];
    expect(byServiceCategory(rows)).toEqual([{ slug: 'temp-fence', count: 1 }]);
  });
});

describe('verifiedOverTime', () => {
  it('returns one entry per day in the lookback window even when there are zero verifications', () => {
    // Use a fixed reference date so the test is deterministic.
    const ref = new Date('2026-05-15T12:00:00.000Z');
    const out = verifiedOverTime([], { now: ref, days: 7 });
    expect(out).toHaveLength(7);
    expect(out.every((d) => d.count === 0)).toBe(true);
    // Dates are ascending.
    for (let i = 1; i < out.length; i++) {
      expect(out[i].date >= out[i - 1].date).toBe(true);
    }
    // Last entry is the reference day (UTC).
    expect(out[out.length - 1].date).toBe('2026-05-15');
  });

  it('counts ranked_at per day inside the window', () => {
    const ref = new Date('2026-05-15T12:00:00.000Z');
    const rows = [
      { ranked_at: '2026-05-13T03:00:00Z' },
      { ranked_at: '2026-05-13T20:00:00Z' },
      { ranked_at: '2026-05-15T08:00:00Z' },
    ];
    const out = verifiedOverTime(rows, { now: ref, days: 7 });
    const may13 = out.find((d) => d.date === '2026-05-13');
    const may15 = out.find((d) => d.date === '2026-05-15');
    expect(may13?.count).toBe(2);
    expect(may15?.count).toBe(1);
  });

  it('ignores rows with null or unparseable ranked_at', () => {
    const ref = new Date('2026-05-15T12:00:00.000Z');
    const rows = [{ ranked_at: null }, { ranked_at: 'not a date' }, { ranked_at: '2026-05-15T08:00:00Z' }];
    const out = verifiedOverTime(rows, { now: ref, days: 7 });
    const total = out.reduce((acc, d) => acc + d.count, 0);
    expect(total).toBe(1);
  });
});
