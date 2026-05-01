// __tests__/coverage-expansion/estimate.test.ts — Phase 2 Stream E, Gate E2.
import { describe, expect, it } from 'vitest';
import { estimateCoverage } from '@/services/coverage-expansion/tools/estimate';

describe('estimateCoverage', () => {
  it('aggregates tier-1/2/3 counts and computes lift + cost + duration', async () => {
    const e = await estimateCoverage({
      goal: 'g',
      constraints: {},
      sessionId: 's',
      candidates: [
        { candidate_url: 'https://a/resource/x.json', candidate_type: 'socrata', estimated_impact: 5, estimated_tier: 1 },
        { candidate_url: 'https://b/resource/y.json', candidate_type: 'socrata', estimated_impact: 2, estimated_tier: 1 },
        { candidate_url: 'https://c/login', candidate_type: 'tier_2', estimated_impact: 3, estimated_tier: 2 },
        { candidate_url: 'https://d/paid', candidate_type: 'tier_3', estimated_impact: 0, estimated_tier: 3 },
      ],
    });
    expect(e.discovered_candidates).toBe(4);
    expect(e.estimated_auto_onboardable).toBe(2);
    expect(e.estimated_human_assist).toBe(1);
    expect(e.estimated_declined).toBe(1);
    expect(e.estimated_daily_lift).toBeCloseTo(10, 1);
    expect(e.estimated_total_cost_usd).toBeGreaterThan(0);
    expect(e.estimated_duration_hours.high).toBeGreaterThanOrEqual(e.estimated_duration_hours.low);
  });

  it('handles empty candidate list', async () => {
    const e = await estimateCoverage({ goal: 'g', constraints: {}, sessionId: 's', candidates: [] });
    expect(e.discovered_candidates).toBe(0);
    expect(e.estimated_total_cost_usd).toBe(0);
  });
});
