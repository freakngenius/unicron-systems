// __tests__/app/internal-dashboard.branch.test.ts, Stream B Dashboard.
//
// Verifies the branch logic that gates the new Internal dashboard. Orgs
// without a non-empty architecture.modules block MUST take the legacy
// rendering path so Zedcor, Realberry, and Funder are byte-identical to
// today.

import { describe, it, expect } from 'vitest';
import { shouldUseInternalDashboard } from '@/app/[slug]/internalDashboardBranch';

describe('shouldUseInternalDashboard', () => {
  it('returns false for an org with no architecture', () => {
    expect(shouldUseInternalDashboard(null)).toBe(false);
    expect(shouldUseInternalDashboard(undefined as unknown as Record<string, unknown>)).toBe(false);
  });

  it('returns false for an org whose architecture lacks a modules block (Zedcor, Realberry, Funder)', () => {
    expect(shouldUseInternalDashboard({})).toBe(false);
    expect(shouldUseInternalDashboard({ lead_unit: { name: 'project' } })).toBe(false);
  });

  it('returns false for an org with an empty modules block (defensive)', () => {
    expect(shouldUseInternalDashboard({ modules: {} })).toBe(false);
  });

  it('returns false when modules is not an object (defensive: misconfig must take legacy path)', () => {
    expect(shouldUseInternalDashboard({ modules: 'not-an-object' as unknown })).toBe(false);
    expect(shouldUseInternalDashboard({ modules: [] as unknown })).toBe(false);
  });

  it('returns true for Internal (modules block present and non-empty)', () => {
    const internal = {
      modules: {
        'ranked-feed': { enabled: true },
        'kpi-strip': { enabled: true, config: { metrics: ['avg_score'] } },
      },
    };
    expect(shouldUseInternalDashboard(internal)).toBe(true);
  });

  it('returns true even when every module is enabled:false (the presence of the block is the trigger)', () => {
    // The renderer itself decides per-slot. The branch only opts the org
    // into the slot-aware page; per-module enablement is resolved further down.
    expect(shouldUseInternalDashboard({ modules: { 'ranked-feed': { enabled: false } } })).toBe(true);
  });
});
