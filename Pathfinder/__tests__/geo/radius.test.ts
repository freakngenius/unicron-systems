// __tests__/geo/radius.test.ts — ICP Saved Search S2.
//
// Deterministic table tests for the radius helpers. No mocks; the
// functions are pure.

import { describe, it, expect } from 'vitest';
import {
  bboxFromCenterAndRadius,
  rankStatesByDistance,
  statesWithinRadius,
  STATE_INCLUSION_PAD_MILES,
} from '@/lib/geo/radius';

describe('statesWithinRadius', () => {
  it('includes the center state and neighbors for a Houston, TX query', () => {
    // Houston, TX ≈ 29.76, -95.37
    const states = statesWithinRadius(29.76, -95.37, 200);
    expect(states).toContain('TX');
    // Within radius+pad (~450mi) we should pull in at least LA and OK.
    expect(states).toContain('LA');
    expect(states).toContain('OK');
    // Should NOT include far-away states like Alaska or Maine at this radius.
    expect(states).not.toContain('AK');
    expect(states).not.toContain('ME');
  });

  it('returns at least one state for radius 0 (closest centroid wins)', () => {
    // Sacramento, CA ≈ 38.58, -121.49
    const states = statesWithinRadius(38.58, -121.49, 0);
    expect(states.length).toBeGreaterThan(0);
    expect(states).toContain('CA');
  });

  it('expands the catchment when radius is large', () => {
    const small = statesWithinRadius(29.76, -95.37, 50);
    const large = statesWithinRadius(29.76, -95.37, 800);
    expect(large.length).toBeGreaterThan(small.length);
  });

  it('uses the documented inclusion pad', () => {
    expect(STATE_INCLUSION_PAD_MILES).toBeGreaterThan(0);
  });

  it('clamps negative radius to 0', () => {
    const states = statesWithinRadius(29.76, -95.37, -100);
    expect(states.length).toBeGreaterThan(0);
    expect(states).toContain('TX');
  });
});

describe('bboxFromCenterAndRadius', () => {
  it('produces a box around the center wider than tall in lat', () => {
    const bbox = bboxFromCenterAndRadius(29.76, -95.37, 200);
    expect(bbox.north).toBeGreaterThan(29.76);
    expect(bbox.south).toBeLessThan(29.76);
    expect(bbox.east).toBeGreaterThan(-95.37);
    expect(bbox.west).toBeLessThan(-95.37);
    // 200mi ≈ 2.9° lat
    const latSpan = bbox.north - bbox.south;
    expect(latSpan).toBeGreaterThan(5.0);
    expect(latSpan).toBeLessThan(7.0);
  });

  it('clamps to the WGS84 envelope at extreme inputs', () => {
    const bbox = bboxFromCenterAndRadius(89, 0, 5000);
    expect(bbox.north).toBeLessThanOrEqual(90);
    expect(bbox.south).toBeGreaterThanOrEqual(-90);
    expect(bbox.east).toBeLessThanOrEqual(180);
    expect(bbox.west).toBeGreaterThanOrEqual(-180);
  });

  it('returns a zero-area bbox for radius 0', () => {
    const bbox = bboxFromCenterAndRadius(29.76, -95.37, 0);
    expect(bbox.north).toBeCloseTo(29.76, 4);
    expect(bbox.south).toBeCloseTo(29.76, 4);
    expect(bbox.east).toBeCloseTo(-95.37, 4);
    expect(bbox.west).toBeCloseTo(-95.37, 4);
  });
});

describe('rankStatesByDistance', () => {
  it('returns states sorted closest-first', () => {
    // Sacramento, CA — closest centroid should be CA.
    const ranked = rankStatesByDistance(38.58, -121.49);
    expect(ranked[0]?.centroid.state_code).toBe('CA');
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i]!.distance_mi).toBeGreaterThanOrEqual(ranked[i - 1]!.distance_mi);
    }
  });
});
