// __tests__/catalog/modules/metrics-view/metrics.test.ts, Stream F.
//
// Rich metric resolvers feeding the metrics view. The PR blocker for Stream
// F is that active_outbound_motion NEVER renders a bare misleading 0%. This
// suite locks that down: when most rows are Unknown the resolver returns a
// tile with value=null and a "Confirmed active: X of Y; Z Unknown" subtext.

import { describe, it, expect, vi } from 'vitest';
import {
  resolveMetricTile,
  type MetricResolverDeps,
} from '@/lib/catalog/modules/metrics-view/metrics';

function adminWith({
  countRow,
  data,
}: { countRow?: number | null; data?: Array<Record<string, unknown>> } = {}) {
  // Build a flexible chain that satisfies the patterns used by the four
  // resolvers in this module:
  //   verified_count_1d:  .select(head).eq().eq().gte() => { count }
  //   active_outbound:    .select().eq().limit()         => { data }
  //   avg_score:          .select().eq().not().limit()    => { data }
  // (sources_live does not touch supabase.)
  const limit = vi.fn().mockResolvedValue({ data: data ?? [], error: null });
  const gte = vi.fn().mockResolvedValue({ count: countRow ?? 0, error: null });
  const notChain = { limit };
  const eqVerified = { gte };
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(eqVerified),
      not: vi.fn().mockReturnValue(notChain),
      limit,
    }),
  });
  return { from: vi.fn().mockReturnValue({ select }) };
}

function deps(overrides: Partial<MetricResolverDeps> = {}): MetricResolverDeps {
  return {
    orgId: 'org-internal',
    admin: adminWith() as unknown as MetricResolverDeps['admin'],
    architecture: {
      sources: [
        { id: 'sam-gov', type: 'registered' },
        { id: 'usaspending', type: 'registered' },
        { id: 'custom-x', type: 'pending' },
      ],
    },
    ...overrides,
  };
}

describe('resolveMetricTile', () => {
  it('drops an unknown metric id with a warning', async () => {
    const out = await resolveMetricTile('not_a_metric', deps());
    expect(out).toBeNull();
  });

  describe('verified_count_1d', () => {
    it('returns the count (real zero IS meaningful)', async () => {
      const d = deps({ admin: adminWith({ countRow: 0 }) as unknown as MetricResolverDeps['admin'] });
      const out = await resolveMetricTile('verified_count_1d', d);
      expect(out).not.toBeNull();
      expect(out!.value).toBe(0);
      expect(out!.tooltip).toMatch(/good-fit/i);
    });

    it('returns a non-zero count', async () => {
      const d = deps({ admin: adminWith({ countRow: 4 }) as unknown as MetricResolverDeps['admin'] });
      const out = await resolveMetricTile('verified_count_1d', d);
      expect(out!.value).toBe(4);
    });
  });

  describe('active_outbound_motion (PR blocker: never bare 0%)', () => {
    it('returns null when the org has zero rows (no denominator)', async () => {
      const out = await resolveMetricTile('active_outbound_motion', deps());
      expect(out).toBeNull();
    });

    it('renders the honest subtext when most rows are Unknown', async () => {
      // 1 active + 219 unknown matches live Internal data.
      const rows = [
        ...Array.from({ length: 1 }, () => ({
          raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } },
        })),
        ...Array.from({ length: 219 }, () => ({
          raw_payload: { internal_enrichment: { sales_motion: 'unknown' } },
        })),
      ];
      const d = deps({ admin: adminWith({ data: rows }) as unknown as MetricResolverDeps['admin'] });
      const out = await resolveMetricTile('active_outbound_motion', d);
      expect(out).not.toBeNull();
      // PR-blocker assertion: NO bare misleading 0 displayed as a percent.
      expect(out!.value).toBeNull();
      expect(out!.subText).toBe('Confirmed active: 1 of 220; 219 Unknown');
      expect(out!.tooltip).toMatch(/Unknown/);
    });

    it('counts hiring-bd as "confirmed active" (outbound hiring signal)', async () => {
      const rows = [
        ...Array.from({ length: 1 }, () => ({
          raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } },
        })),
        ...Array.from({ length: 9 }, () => ({
          raw_payload: { internal_enrichment: { sales_motion: 'hiring-bd' } },
        })),
        ...Array.from({ length: 219 }, () => ({
          raw_payload: { internal_enrichment: { sales_motion: 'unknown' } },
        })),
      ];
      const d = deps({ admin: adminWith({ data: rows }) as unknown as MetricResolverDeps['admin'] });
      const out = await resolveMetricTile('active_outbound_motion', d);
      expect(out!.subText).toBe('Confirmed active: 10 of 229; 219 Unknown');
    });

    it('treats missing sales_motion as Unknown', async () => {
      const rows = [
        { raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } } },
        { raw_payload: { internal_enrichment: {} } }, // missing
        { raw_payload: null },
      ];
      const d = deps({ admin: adminWith({ data: rows }) as unknown as MetricResolverDeps['admin'] });
      const out = await resolveMetricTile('active_outbound_motion', d);
      expect(out!.subText).toBe('Confirmed active: 1 of 3; 2 Unknown');
    });

    it('renders a percent when most rows ARE confirmed (no unknown majority)', async () => {
      // 8 active + 2 unknown -> 80% with breakdown still as subtext.
      const rows = [
        ...Array.from({ length: 8 }, () => ({
          raw_payload: { internal_enrichment: { sales_motion: 'active-outbound' } },
        })),
        ...Array.from({ length: 2 }, () => ({
          raw_payload: { internal_enrichment: { sales_motion: 'unknown' } },
        })),
      ];
      const d = deps({ admin: adminWith({ data: rows }) as unknown as MetricResolverDeps['admin'] });
      const out = await resolveMetricTile('active_outbound_motion', d);
      // unknownShare 0.2 < 0.25 AND confirmed > 0 -> bare value 80%
      expect(out!.value).toBe(80);
      expect(out!.suffix).toBe('%');
      expect(out!.subText).toBe('Confirmed active: 8 of 10; 2 Unknown');
    });
  });

  describe('avg_score_out_of_100', () => {
    it('returns null when no scored rows exist', async () => {
      const out = await resolveMetricTile('avg_score_out_of_100', deps());
      expect(out).toBeNull();
    });

    it('returns the rounded mean and a "/100" suffix', async () => {
      const rows = [{ score: 70 }, { score: 80 }, { score: 90 }];
      const d = deps({ admin: adminWith({ data: rows }) as unknown as MetricResolverDeps['admin'] });
      const out = await resolveMetricTile('avg_score_out_of_100', d);
      expect(out!.value).toBe(80);
      expect(out!.suffix).toBe('/100');
      expect(out!.subText).toMatch(/Across 3 scored companies/);
    });
  });

  describe('sources_live', () => {
    it('returns live count + which sources are live in subText', async () => {
      const out = await resolveMetricTile('sources_live', deps());
      expect(out!.value).toBe(2);
      expect(out!.subText).toMatch(/Sam gov/);
      expect(out!.subText).toMatch(/Usaspending/);
      expect(out!.subText).toMatch(/1 pending/);
    });

    it('returns 0 with an explanatory subtext when none are live', async () => {
      const d = deps({
        architecture: {
          sources: [{ id: 'a', type: 'pending' }, { id: 'b', type: 'pending' }],
        },
      });
      const out = await resolveMetricTile('sources_live', d);
      expect(out!.value).toBe(0);
      expect(out!.subText).toMatch(/0 of 2 registered sources/);
    });
  });
});
