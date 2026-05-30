// __tests__/catalog/modules/kpi-strip/metrics.test.ts, Stream B Dashboard.
//
// Each metric resolver returns either a real number OR null. NULL means
// "DROP this KPI" so the strip never renders a misleading zero. The
// existing lib/metrics/kpiQueries.ts has a known bug where
// active_motion_pct returns 0 when there are no verified rows; this
// module fixes that by returning null in the same case (no denominator).

import { describe, it, expect, vi } from 'vitest';
import {
  resolveMetric,
  type MetricResolverDeps,
} from '@/lib/catalog/modules/kpi-strip/metrics';

function adminFor(rows: Array<Record<string, unknown>>, count?: number | null) {
  const gte = vi.fn().mockResolvedValue({ data: rows, count: count ?? rows.length, error: null });
  const eqVerified = vi.fn().mockReturnValue({ gte });
  const eqOrg = vi.fn().mockReturnValue({ eq: eqVerified });
  const not = vi.fn().mockReturnValue({ eq: eqOrg });
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  // The avg_score resolver uses .select().eq().not().limit() shape.
  // The verified_count_1d resolver uses .select(head).eq().eq().gte() shape.
  // The active_motion_pct resolver uses .select().eq().eq().limit() shape.
  // Provide a unified stub that lazily dispatches based on the chain.
  const select = vi.fn().mockImplementation(() => ({
    eq: (col1: string, _v1: string) =>
      col1 === 'organization_id'
        ? {
            eq: (col2: string, _v2: unknown) =>
              col2 === 'verified'
                ? { gte, limit }
                : { gte, limit, eq: vi.fn() },
            not: vi.fn().mockReturnValue({ limit }),
            limit,
          }
        : { eq: vi.fn(), not: vi.fn(), limit },
  }));
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

function deps(rows: Array<Record<string, unknown>> = [], count?: number | null): MetricResolverDeps {
  return {
    orgId: 'org-internal',
    admin: adminFor(rows, count) as unknown as MetricResolverDeps['admin'],
    architecture: {
      sources: [
        { id: 'sam-gov', type: 'registered' },
        { id: 'usaspending', type: 'registered' },
        { id: 'custom-x', type: 'pending' },
      ],
      lead_unit: {
        schema: {
          sales_motion: {
            type: 'enum',
            display_label: 'Sales motion',
            enum_values: ['active-outbound', 'inbound-only', 'unknown'],
          },
        },
      },
    },
  };
}

describe('resolveMetric', () => {
  it('returns null for an unknown metric_id (drops the KPI, logs a warning)', async () => {
    const out = await resolveMetric('not_a_metric', deps());
    expect(out).toBeNull();
  });

  describe('verified_count_1d', () => {
    it('returns the count for verified projects ranked in the last 24h (real zero is a valid value)', async () => {
      const out = await resolveMetric('verified_count_1d', deps([], 0));
      expect(out).toBe(0);
    });

    it('returns a non-zero count when rows exist', async () => {
      const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const out = await resolveMetric('verified_count_1d', deps(rows, 3));
      expect(out).toBe(3);
    });
  });

  describe('active_motion_pct (the false-zero red flag the spec calls out)', () => {
    it('returns null when there are zero verified rows (DENOMINATOR ZERO, never render as 0%)', async () => {
      const out = await resolveMetric('active_motion_pct', deps([]));
      expect(out).toBeNull();
    });

    it('returns null when the org schema lacks sales_motion (extractor broken: DROP, do not show 0%)', async () => {
      const d = deps([{ raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } } }]);
      d.architecture.lead_unit = { schema: {} };
      const out = await resolveMetric('active_motion_pct', d);
      expect(out).toBeNull();
    });

    it('returns null when the sales_motion enum has no outbound member (semantic mismatch: DROP)', async () => {
      const d = deps([{ raw_payload: { internal_enrichment: { sales_motion: 'inbound-only' } } }]);
      d.architecture.lead_unit = {
        schema: {
          sales_motion: { type: 'enum', display_label: 'Sales motion', enum_values: ['inbound-only'] },
        },
      };
      const out = await resolveMetric('active_motion_pct', d);
      expect(out).toBeNull();
    });

    it('returns the correct percent when verified rows + outbound enum both exist', async () => {
      const d = deps([
        { raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } } },
        { raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } } },
        { raw_payload: { internal_enrichment: { sales_motion: 'inbound-only' } } },
        { raw_payload: { internal_enrichment: { sales_motion: 'unknown' } } },
      ]);
      const out = await resolveMetric('active_motion_pct', d);
      expect(out).toBe(50);
    });
  });

  describe('avg_score', () => {
    it('returns null when no scored rows exist (no average to compute, DROP)', async () => {
      const out = await resolveMetric('avg_score', deps([]));
      expect(out).toBeNull();
    });

    it('returns the rounded mean over scored rows', async () => {
      const d = deps([{ score: 70 }, { score: 80 }, { score: 90 }]);
      const out = await resolveMetric('avg_score', d);
      expect(out).toBe(80);
    });
  });

  describe('sources_live', () => {
    it('returns the count of architecture.sources with type=registered (real zero is meaningful)', async () => {
      const out = await resolveMetric('sources_live', deps());
      expect(out).toBe(2);
    });

    it('returns 0 when no registered sources exist (real zero, not null: "no live sources" is informative)', async () => {
      const d = deps();
      d.architecture.sources = [
        { id: 'a', type: 'pending' },
        { id: 'b', type: 'pending' },
      ];
      const out = await resolveMetric('sources_live', d);
      expect(out).toBe(0);
    });
  });
});
