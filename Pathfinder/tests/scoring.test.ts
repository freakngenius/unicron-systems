// tests/scoring.test.ts — covers the pure scoring kernel.
import { describe, expect, it } from 'vitest';
import {
  computeCustomerScore,
  computeGeoScore,
  computeStageScore,
  findWarmIntro,
  haversineMiles,
  nearestBranch,
  scoreProject,
} from '@/lib/scoring';

const NYC = { lat: 40.7128, lon: -74.006 };
const LA = { lat: 34.0522, lon: -118.2437 };

const HOU = { id: 'hou-002', lat: 29.7604, lon: -95.3698, coverage_radius_miles: 300 };
const PHX = { id: 'phx-001', lat: 33.4484, lon: -112.074, coverage_radius_miles: 300 };
const ATL = { id: 'atl-003', lat: 33.749, lon: -84.388, coverage_radius_miles: 300 };
const BRANCHES = [HOU, PHX, ATL];

describe('haversineMiles', () => {
  it('NYC → LA is ~2444 miles (±5)', () => {
    const d = haversineMiles(NYC.lat, NYC.lon, LA.lat, LA.lon);
    expect(d).toBeGreaterThan(2439);
    expect(d).toBeLessThan(2449);
  });

  it('same point is exactly zero', () => {
    expect(haversineMiles(NYC.lat, NYC.lon, NYC.lat, NYC.lon)).toBe(0);
  });

  it('antipodal sanity — half Earth circumference, ~12,438 mi', () => {
    // (0,0) and (0,180) are antipodal on the equator.
    const d = haversineMiles(0, 0, 0, 180);
    expect(d).toBeGreaterThan(12_400);
    expect(d).toBeLessThan(12_460);
  });

  it('symmetric in argument order', () => {
    const a = haversineMiles(NYC.lat, NYC.lon, LA.lat, LA.lon);
    const b = haversineMiles(LA.lat, LA.lon, NYC.lat, NYC.lon);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('nearestBranch', () => {
  it('picks Houston for a project in greater Houston', () => {
    const r = nearestBranch({ lat: 29.76, lon: -95.4 }, BRANCHES);
    expect(r.branch_id).toBe('hou-002');
    expect(r.distance_miles).toBeLessThan(10);
  });

  it('picks Phoenix for a project in Maricopa County', () => {
    const r = nearestBranch({ lat: 33.45, lon: -112.07 }, BRANCHES);
    expect(r.branch_id).toBe('phx-001');
  });

  it('picks Atlanta for a project in metro ATL', () => {
    const r = nearestBranch({ lat: 33.75, lon: -84.39 }, BRANCHES);
    expect(r.branch_id).toBe('atl-003');
  });

  it('throws on empty branches array', () => {
    expect(() => nearestBranch({ lat: 0, lon: 0 }, [])).toThrow();
  });
});

describe('findWarmIntro', () => {
  it('returns the customer id when nearest customer is served by a different branch', () => {
    // Project sits in PHX coverage, but the closest customer is served by HOU.
    const project = { lat: 33.46, lon: -112.08 };
    const customers = [
      { id: 'c-bh', lat: 33.46, lon: -112.08, served_by_branch_id: 'hou-002' },
      { id: 'c-far', lat: 25, lon: -80, served_by_branch_id: 'atl-003' },
    ];
    const id = findWarmIntro(project, customers, 'phx-001');
    expect(id).toBe('c-bh');
  });

  it('returns null when only the same-branch customer is in range', () => {
    const project = { lat: 33.46, lon: -112.08 };
    const customers = [
      { id: 'c-bh', lat: 33.46, lon: -112.08, served_by_branch_id: 'phx-001' },
    ];
    const id = findWarmIntro(project, customers, 'phx-001');
    expect(id).toBeNull();
  });

  it('skips same-branch customers and returns the closest cross-branch one in range', () => {
    // Same-branch customer is closer, but findWarmIntro should ignore it
    // and return the cross-branch customer that's still within 50mi.
    const project = { lat: 33.46, lon: -112.08 };
    const customers = [
      { id: 'c-same', lat: 33.46, lon: -112.08, served_by_branch_id: 'phx-001' },
      { id: 'c-cross', lat: 33.50, lon: -112.40, served_by_branch_id: 'hou-002' }, // ~18mi
      { id: 'c-far',   lat: 25,    lon: -80,     served_by_branch_id: 'atl-003' },
    ];
    const id = findWarmIntro(project, customers, 'phx-001');
    expect(id).toBe('c-cross');
  });

  it('returns null when no customer is within range', () => {
    const project = { lat: 33.46, lon: -112.08 };
    const customers = [
      // Far away in Atlanta, served by a different branch
      { id: 'c-em', lat: 33.79, lon: -84.32, served_by_branch_id: 'atl-003' },
    ];
    const id = findWarmIntro(project, customers, 'phx-001');
    expect(id).toBeNull();
  });
});

describe('computeGeoScore', () => {
  it('100 within 50 miles', () => {
    expect(computeGeoScore(0, 300)).toBe(100);
    expect(computeGeoScore(20, 300)).toBe(100);
    expect(computeGeoScore(49.9, 300)).toBe(100);
  });

  it('linearly decays between 50 and coverage radius', () => {
    // halfway between 50 and 300 is 175; should be ~50
    expect(computeGeoScore(175, 300)).toBeCloseTo(50, 0);
  });

  it('0 at or past coverage radius', () => {
    expect(computeGeoScore(300, 300)).toBe(0);
    expect(computeGeoScore(450, 300)).toBe(0);
  });
});

describe('computeStageScore', () => {
  it('maps known stages', () => {
    expect(computeStageScore('RFP')).toBe(90);
    expect(computeStageScore('PRE')).toBe(75);
    expect(computeStageScore('PLN')).toBe(55);
    expect(computeStageScore('NWS')).toBe(35);
  });

  it('case-insensitive', () => {
    expect(computeStageScore('rfp')).toBe(90);
    expect(computeStageScore('  Pre  ')).toBe(75);
  });

  it('null/unknown defaults to 50', () => {
    expect(computeStageScore(null)).toBe(50);
    expect(computeStageScore('XYZ')).toBe(50);
  });
});

describe('computeCustomerScore', () => {
  it('100 within 10mi of any customer', () => {
    const project = { lat: 29.76, lon: -95.37 };
    const customers = [{ lat: 29.77, lon: -95.36 }]; // tiny offset
    expect(computeCustomerScore(project, customers)).toBe(100);
  });

  it('linearly decays between 10 and 50 miles', () => {
    // 30 miles north of project — halfway through decay window (10..50) → ~50
    const project = { lat: 33.0, lon: -112.0 };
    const customers = [{ lat: 33.0 + 30 / 69, lon: -112.0 }]; // ~30mi north
    const s = computeCustomerScore(project, customers);
    expect(s).toBeGreaterThan(45);
    expect(s).toBeLessThan(55);
  });

  it('0 beyond 50 miles', () => {
    const project = { lat: 0, lon: 0 };
    const customers = [{ lat: 10, lon: 0 }]; // ~690mi away
    expect(computeCustomerScore(project, customers)).toBe(0);
  });

  it('0 with no customers', () => {
    expect(computeCustomerScore({ lat: 0, lon: 0 }, [])).toBe(0);
  });
});

describe('scoreProject', () => {
  it('high-priority RFP within 20mi of branch + 8mi of customer scores >= 85', () => {
    // Project ~12 miles from HOU branch, ~8 miles from Memorial Hermann customer
    const project = {
      lat: 29.92,
      lon: -95.4,
      project_value: 4_200_000,
      project_stage: 'RFP',
    };
    const customers = [
      { id: 'c-mh', lat: 29.92, lon: -95.42, served_by_branch_id: 'hou-002' }, // ~1mi
    ];
    const out = scoreProject({ project, branches: BRANCHES, customers });
    expect(out.nearest_branch_id).toBe('hou-002');
    expect(out.in_coverage).toBe(true);
    expect(out.composite_score).toBeGreaterThanOrEqual(85);
    expect(out.geo_score).toBe(100);
    expect(out.stage_score).toBe(90);
    expect(out.customer_score).toBe(100);
  });

  it('project far from every branch — out of coverage, geo_score 0', () => {
    // Middle of the Atlantic
    const project = { lat: 30, lon: -40, project_stage: 'PLN', project_value: null };
    const out = scoreProject({ project, branches: BRANCHES, customers: [] });
    expect(out.in_coverage).toBe(false);
    expect(out.geo_score).toBe(0);
    expect(out.customer_score).toBe(0);
    // Composite is driven entirely by stage = 55 weighted at 0.3 → ~17
    expect(out.composite_score).toBeLessThan(25);
  });

  it('warm-intro example from prototype: Maricopa Co. RFP near Banner Health (PHX)', () => {
    // p-10 in the prototype: Maricopa records modernization, warmFor c-bh.
    // Banner Health customer is in PHX; the project is in Maricopa, served by
    // PHX branch. To produce a "warm intro" via the cross-pollination
    // semantics, the closest customer needs to be served by a DIFFERENT
    // branch than the project's nearest branch. We model that here by
    // using a customer who's geographically close but served by a
    // different branch (cross-pollination signal).
    const project = {
      lat: 33.46,
      lon: -112.08,
      project_stage: 'RFP',
      project_value: 2_800_000,
    };
    const customers = [
      // Closest customer, served by a different branch than the nearest branch
      { id: 'c-cross', lat: 33.46, lon: -112.08, served_by_branch_id: 'hou-002' },
    ];
    const out = scoreProject({ project, branches: BRANCHES, customers });
    expect(out.nearest_branch_id).toBe('phx-001');
    expect(out.warm_for_customer_id).toBe('c-cross');
    expect(out.composite_score).toBeGreaterThanOrEqual(85);
  });

  it('composite is 0.5 geo + 0.3 stage + 0.2 customer, rounded', () => {
    const project = { lat: 29.76, lon: -95.37, project_stage: 'PLN', project_value: null };
    const customers: { id: string; lat: number; lon: number; served_by_branch_id: string | null }[] = [];
    const out = scoreProject({ project, branches: BRANCHES, customers });
    // 0 miles → geo 100; PLN → 55; no customers → 0
    // composite = 0.5*100 + 0.3*55 + 0.2*0 = 50 + 16.5 + 0 = 66.5 → 67
    expect(out.geo_score).toBe(100);
    expect(out.stage_score).toBe(55);
    expect(out.customer_score).toBe(0);
    expect(out.composite_score).toBe(67);
  });
});
