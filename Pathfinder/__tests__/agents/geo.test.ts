// Unit tests for the GeoMapper shim — Stream A Gate A2.
// Asserts the thin wrapper preserves the underlying lib/scoring.ts contract
// and handles the lat/lon-missing path without throwing.

import { describe, expect, it } from 'vitest';
import { mapGeo, haversineMiles, nearestBranch } from '@/lib/agents/geo';

const austin = { id: 'br-aus', lat: 30.2672, lon: -97.7431, coverage_radius_miles: 250 };
const dallas = { id: 'br-dfw', lat: 32.7767, lon: -96.797, coverage_radius_miles: 250 };
const branches = [austin, dallas];

const customerNearAus = {
  id: 'cust-aus',
  lat: 30.4,
  lon: -97.6,
  served_by_branch_id: 'br-aus',
};
const customerCrossBranch = {
  id: 'cust-x',
  lat: 30.4,
  lon: -97.6,
  served_by_branch_id: 'br-dfw',
};

describe('lib/agents/geo — mapGeo', () => {
  it('returns the nearest branch and computes coverage from per-branch radius', () => {
    const project = { lat: 30.27, lon: -97.74 };
    const r = mapGeo(project, branches, []);
    expect(r.nearest_branch_id).toBe('br-aus');
    expect(r.distance_miles).not.toBeNull();
    expect(r.distance_miles!).toBeLessThan(5);
    expect(r.in_coverage).toBe(true);
    expect(r.warm_for_customer_id).toBeNull();
  });

  it('finds a cross-branch customer for warm intro', () => {
    const project = { lat: 30.27, lon: -97.74 };
    const r = mapGeo(project, branches, [customerCrossBranch]);
    expect(r.warm_for_customer_id).toBe('cust-x');
  });

  it('ignores same-branch customers — warm intro stays null', () => {
    const project = { lat: 30.27, lon: -97.74 };
    const r = mapGeo(project, branches, [customerNearAus]);
    expect(r.warm_for_customer_id).toBeNull();
  });

  it('returns nulls when project has no coordinates', () => {
    const project = { lat: null, lon: null };
    const r = mapGeo(project, branches, []);
    expect(r).toEqual({
      nearest_branch_id: null,
      distance_miles: null,
      in_coverage: false,
      warm_for_customer_id: null,
    });
  });

  it('returns nulls when no branches are available', () => {
    const project = { lat: 30.27, lon: -97.74 };
    const r = mapGeo(project, [], []);
    expect(r.nearest_branch_id).toBeNull();
  });

  it('caller-supplied coverageMiles overrides the matched branch radius', () => {
    // 50 miles north of Austin — well within branch's 250mi default but
    // outside an explicit 10-mile override.
    const project = { lat: 30.97, lon: -97.7431 };
    const defaultRun = mapGeo(project, branches, []);
    expect(defaultRun.in_coverage).toBe(true);
    const overrideRun = mapGeo(project, branches, [], 10);
    expect(overrideRun.in_coverage).toBe(false);
  });

  it('haversineMiles is re-exported and matches the kernel', () => {
    const d = haversineMiles(30.2672, -97.7431, 32.7767, -96.797);
    // Austin → Dallas is roughly 182 miles great-circle.
    expect(d).toBeGreaterThan(180);
    expect(d).toBeLessThan(190);
  });

  it('nearestBranch is re-exported', () => {
    const m = nearestBranch({ lat: 32.0, lon: -97.0 }, branches);
    expect(m.branch_id).toBe('br-dfw');
  });
});
