// tests/zedcor-geomapper.test.ts — Z-C feature #6 GeoMapper tests.
//
// Validates the haversine math, nearest-branch selection, and the
// within-radius flag using the actual lat/lon values for Zedcor's three
// target branches (Nashville, Pittsburgh-as-Pennsylvania, Los Angeles)
// from the seeded `pathfinder.zedcor_branches` table.

import { describe, expect, it } from 'vitest';
import {
  findNearestZedcorBranch,
  haversineMiles,
  type ZedcorBranchPoint,
} from '@/lib/zedcor/geomapper';

// City-centroid coordinates seeded into pathfinder.zedcor_branches by
// scripts/seed-zedcor.ts (see lib/zedcor/branch-centroids.ts).
const NASHVILLE = { lat: 36.1627, lon: -86.7816 };
const PITTSBURGH = { lat: 40.4406, lon: -79.9959 }; // PA branch centroid
const LOS_ANGELES = { lat: 34.0522, lon: -118.2437 };
const CALGARY = { lat: 51.0447, lon: -114.0719 };
const HOUSTON = { lat: 29.7604, lon: -95.3698 };

const BRANCHES: ZedcorBranchPoint[] = [
  { id: 'nash', branch_name: 'Nashville', state: 'TN', ...NASHVILLE, radius_miles: 200 },
  { id: 'penn', branch_name: 'Pennsylvania', state: 'PA', ...PITTSBURGH, radius_miles: 200 },
  { id: 'la', branch_name: 'Los Angeles', state: 'CA', ...LOS_ANGELES, radius_miles: 200 },
  { id: 'cal', branch_name: 'Calgary', state: 'AB', ...CALGARY, radius_miles: 200 },
  { id: 'hou', branch_name: 'Houston', state: 'TX', ...HOUSTON, radius_miles: 200 },
];

describe('haversineMiles (object signature)', () => {
  it('LA → Nashville is ~1777 mi (matches positional kernel within 5mi)', () => {
    const d = haversineMiles(LOS_ANGELES, NASHVILLE);
    // Computed: 1776.56. Brief claimed 1801±5; the city-centroid distance
    // is closer to 1777, so we anchor the tolerance band there.
    expect(d).toBeGreaterThan(1772);
    expect(d).toBeLessThan(1782);
  });

  it('Nashville → Pittsburgh is ~472 mi (city centroids)', () => {
    const d = haversineMiles(NASHVILLE, PITTSBURGH);
    // Computed: 471.70. Brief said 445±5 but that assumes a more
    // northwesterly Pittsburgh metro centroid; the seeded PA row uses
    // 40.4406, -79.9959 which is downtown Pittsburgh proper.
    expect(d).toBeGreaterThan(467);
    expect(d).toBeLessThan(477);
  });

  it('symmetric in argument order', () => {
    const a = haversineMiles(LOS_ANGELES, NASHVILLE);
    const b = haversineMiles(NASHVILLE, LOS_ANGELES);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });

  it('same point is exactly zero', () => {
    expect(haversineMiles(NASHVILLE, NASHVILLE)).toBe(0);
  });
});

describe('findNearestZedcorBranch', () => {
  it('returns null when branches array is empty', () => {
    expect(findNearestZedcorBranch(NASHVILLE, [])).toBeNull();
  });

  it('returns null when project lat/lon is non-finite', () => {
    expect(findNearestZedcorBranch({ lat: NaN, lon: -86 }, BRANCHES)).toBeNull();
    expect(findNearestZedcorBranch({ lat: 36, lon: Infinity }, BRANCHES)).toBeNull();
  });

  it('selects Nashville for a project in Murfreesboro, TN (~30mi away)', () => {
    // Murfreesboro: ~35.85, -86.39
    const r = findNearestZedcorBranch({ lat: 35.85, lon: -86.39 }, BRANCHES);
    expect(r).not.toBeNull();
    expect(r!.branch_id).toBe('nash');
    expect(r!.branch_name).toBe('Nashville');
    expect(r!.state).toBe('TN');
    expect(r!.distance_miles).toBeLessThan(40);
    expect(r!.within_radius).toBe(true);
  });

  it('selects Pittsburgh/PA for a project in Pittsburgh metro (within radius)', () => {
    // Cranberry Township, PA: ~40.68, -80.10
    const r = findNearestZedcorBranch({ lat: 40.68, lon: -80.10 }, BRANCHES);
    expect(r).not.toBeNull();
    expect(r!.branch_id).toBe('penn');
    expect(r!.distance_miles).toBeLessThan(20);
    expect(r!.within_radius).toBe(true);
  });

  it('selects LA for a project in San Diego (~120mi away, within 200mi)', () => {
    // San Diego: ~32.7157, -117.1611
    const r = findNearestZedcorBranch({ lat: 32.7157, lon: -117.1611 }, BRANCHES);
    expect(r).not.toBeNull();
    expect(r!.branch_id).toBe('la');
    expect(r!.distance_miles).toBeGreaterThan(110);
    expect(r!.distance_miles).toBeLessThan(135);
    expect(r!.within_radius).toBe(true);
  });

  it('flags within_radius=false when distance exceeds radius', () => {
    // Project in Miami, FL — closest of the seeded set is Nashville (~810mi).
    // Outside the 200mi radius.
    const r = findNearestZedcorBranch({ lat: 25.7617, lon: -80.1918 }, BRANCHES);
    expect(r).not.toBeNull();
    expect(r!.distance_miles).toBeGreaterThan(750);
    expect(r!.within_radius).toBe(false);
  });

  it('Texas project picks Houston, not LA (sanity check on halt condition)', () => {
    // Dallas: ~32.7767, -96.7970. Should pick Houston (~225mi), not LA (~1240mi).
    const r = findNearestZedcorBranch({ lat: 32.7767, lon: -96.7970 }, BRANCHES);
    expect(r).not.toBeNull();
    expect(r!.branch_id).toBe('hou');
    expect(r!.distance_miles).toBeLessThan(250);
    // Halt condition from the brief: known-Texas project must NOT produce
    // a >500mi distance to its nearest branch.
    expect(r!.distance_miles).toBeLessThan(500);
  });

  it('rounds distance to 2 decimal places', () => {
    const r = findNearestZedcorBranch(NASHVILLE, BRANCHES);
    expect(r).not.toBeNull();
    // Nashville is in BRANCHES, so distance to itself is 0.
    expect(r!.distance_miles).toBe(0);
    // Verify rounding precision on a non-trivial pair.
    const r2 = findNearestZedcorBranch({ lat: 35.85, lon: -86.39 }, BRANCHES);
    expect(r2).not.toBeNull();
    const decimals = (r2!.distance_miles.toString().split('.')[1] ?? '').length;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it('within_radius=false when matched branch radius is 0', () => {
    const noRadiusBranches: ZedcorBranchPoint[] = [
      { id: 'x', branch_name: 'Nowhere', state: 'XX', ...NASHVILLE, radius_miles: 0 },
    ];
    const r = findNearestZedcorBranch(NASHVILLE, noRadiusBranches);
    expect(r).not.toBeNull();
    expect(r!.within_radius).toBe(false);
  });
});
