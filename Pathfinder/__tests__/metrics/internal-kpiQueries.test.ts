// __tests__/metrics/internal-kpiQueries.test.ts
//
// Stage 10 of internal-onboarding — all six Internal KPI metric ids are
// mapped and route to a query function. The Stage 3 graceful-degradation
// contract (every metric_id is callable, every return value is a number,
// string, or null) is preserved.
//
// Internal's ui_plan (Pathfinder-Internal-Architecture.json) references six
// metric_ids: verified_count_1d, active_motion_pct, avg_score, sources_live,
// count_by_category, verified_count. avg_score and sources_live shipped
// with Funder Stage 9; the other four ship with Internal Stage 10.

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

describe('Internal KPI metric ids (Stage 10 wired)', () => {
  it('every Internal metric_id either resolves or returns null (never throws)', async () => {
    for (const metricId of INTERNAL_METRIC_IDS) {
      // eslint-disable-next-line no-await-in-loop
      const value = await getKpiValue('not-a-real-uuid', metricId);
      expect(value === null || typeof value === 'number' || typeof value === 'string').toBe(true);
    }
  });

  it('all six Internal metric_ids are mapped in kpiQueryByMetricId', () => {
    for (const metricId of INTERNAL_METRIC_IDS) {
      expect(kpiQueryByMetricId[metricId]).toBeDefined();
    }
  });

  it('shared metric_ids (avg_score, sources_live) stay wired (Funder regression)', () => {
    expect(kpiQueryByMetricId.avg_score).toBeDefined();
    expect(kpiQueryByMetricId.sources_live).toBeDefined();
  });
});
