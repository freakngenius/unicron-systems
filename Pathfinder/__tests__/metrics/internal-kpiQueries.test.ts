// __tests__/metrics/internal-kpiQueries.test.ts
//
// Stage 3 of internal-onboarding — graceful degradation of Internal KPIs.
//
// Internal's ui_plan (Pathfinder-Internal-Architecture.json) references six
// metric_ids: verified_count_1d, active_motion_pct, avg_score, sources_live,
// count_by_category, verified_count. Stage 3 only validates that unmapped
// ids degrade gracefully (the route does NOT 503 when an OPTIONAL metric
// is absent). Stage 10 ships the missing four implementations.
//
// avg_score and sources_live are already mapped (Funder Stage 9). The other
// four must return null without throwing.

import { describe, it, expect } from 'vitest';
import { getKpiValue, kpiQueryByMetricId } from '@/lib/metrics/kpiQueries';

const INTERNAL_METRIC_IDS = [
  'verified_count_1d',
  'active_motion_pct',
  'avg_score',
  'sources_live',
  'count_by_category',
  'verified_count',
];

describe('Internal KPI metric ids (Stage 3 graceful degradation)', () => {
  it('every Internal metric_id either resolves or returns null (never throws)', async () => {
    for (const metricId of INTERNAL_METRIC_IDS) {
      // eslint-disable-next-line no-await-in-loop
      const value = await getKpiValue('not-a-real-uuid', metricId);
      expect(value === null || typeof value === 'number' || typeof value === 'string').toBe(true);
    }
  });

  it('unmapped Internal metric_ids return null (Stage 10 implements them)', async () => {
    const unmapped = ['verified_count_1d', 'active_motion_pct', 'count_by_category', 'verified_count'];
    for (const metricId of unmapped) {
      expect(kpiQueryByMetricId[metricId]).toBeUndefined();
      // eslint-disable-next-line no-await-in-loop
      const v = await getKpiValue('not-a-real-uuid', metricId);
      expect(v).toBeNull();
    }
  });

  it('shared metric_ids (avg_score, sources_live) are still wired (Funder regression)', () => {
    expect(kpiQueryByMetricId.avg_score).toBeDefined();
    expect(kpiQueryByMetricId.sources_live).toBeDefined();
  });
});
