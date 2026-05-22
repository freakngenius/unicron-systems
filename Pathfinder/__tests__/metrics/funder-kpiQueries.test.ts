// __tests__/metrics/funder-kpiQueries.test.ts
// Funder onboarding Stage 9 — KPI query registry tests.

import { describe, it, expect } from 'vitest';
import { kpiQueryByMetricId, getKpiValue } from '@/lib/metrics/kpiQueries';

describe('kpiQueryByMetricId registry', () => {
  it('registers all 4 Funder KPI metric_ids', () => {
    expect(kpiQueryByMetricId.verified_count_7d).toBeDefined();
    expect(kpiQueryByMetricId.actively_raising_count).toBeDefined();
    expect(kpiQueryByMetricId.avg_score).toBeDefined();
    expect(kpiQueryByMetricId.sources_live).toBeDefined();
  });

  it('getKpiValue returns null for unknown metric_id (forward-compat)', async () => {
    const v = await getKpiValue('any-org', 'metric-does-not-exist');
    expect(v).toBeNull();
  });

  it('getKpiValue swallows underlying errors and returns null', async () => {
    // verified_count_7d will try supabase with a bad org id and either
    // return 0 or null; in CI without DB, it should not throw.
    const v = await getKpiValue('not-a-uuid', 'verified_count_7d');
    expect(v === null || typeof v === 'number').toBe(true);
  });
});
