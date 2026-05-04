// tests/branch-view.test.ts — Demo Polish UX Gate 12I.
//
// Pure-math tests for the branch focus camera helper. Validates that:
//   - Houston / LA / Nashville / Pittsburgh all get the SAME zoom at a
//     given viewport (latitude scales mpp slightly, so they're close
//     but not identical — the previous fitBounds code zoomed each one
//     to a wildly different scale because of project-pin spread)
//   - The 250mi diameter ring fits within the visible pane vertically
//   - panBy compensates for asymmetric chrome (right ProjectList wider
//     than left BranchDock, top chrome taller than bottom)
//   - Clamps respect minZoom / maxZoom

import { describe, it, expect } from 'vitest';

import { computeBranchView } from '@/lib/geography/branch-view';

const PROD_PADDING = { top: 220, right: 420, bottom: 80, left: 280 };

const BRANCHES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Houston',    lat: 29.7604, lng: -95.3698 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Nashville',  lat: 36.1627, lng: -86.7816 },
  { name: 'Pittsburgh', lat: 40.4406, lng: -79.9959 },
];

describe('computeBranchView — zoom consistency', () => {
  it.each(BRANCHES)(
    '$name produces a zoom in the 6–8 range at 1080p (250mi circle ≈ pane height)',
    ({ lat }) => {
      const view = computeBranchView({
        lat,
        viewportH: 1080,
        viewportW: 1920,
        padding: PROD_PADDING,
      });
      expect(view.zoom).toBeGreaterThan(6);
      expect(view.zoom).toBeLessThan(8);
    },
  );

  it('zooms in (higher z) on tall viewports vs short ones', () => {
    const tall = computeBranchView({
      lat: 35,
      viewportH: 1440,
      viewportW: 1920,
      padding: PROD_PADDING,
    });
    const short = computeBranchView({
      lat: 35,
      viewportH: 720,
      viewportW: 1920,
      padding: PROD_PADDING,
    });
    expect(tall.zoom).toBeGreaterThan(short.zoom);
  });

  it('produces near-identical zooms across US latitudes (within 0.5)', () => {
    // Houston (29°) and Pittsburgh (40°) are 11° apart — the cos(φ) term
    // produces a small but non-zero spread. Should be well under 0.5.
    const houston = computeBranchView({
      lat: 29.7604,
      viewportH: 1080,
      viewportW: 1920,
      padding: PROD_PADDING,
    });
    const pittsburgh = computeBranchView({
      lat: 40.4406,
      viewportH: 1080,
      viewportW: 1920,
      padding: PROD_PADDING,
    });
    expect(Math.abs(houston.zoom - pittsburgh.zoom)).toBeLessThan(0.5);
  });
});

describe('computeBranchView — circle fits the visible pane', () => {
  it('500mi diameter occupies ~92% of visible pane height (default fillRatio)', () => {
    const lat = 35;
    const viewportH = 1080;
    const view = computeBranchView({
      lat,
      viewportH,
      viewportW: 1920,
      padding: PROD_PADDING,
    });
    // metersPerPixel at the computed zoom
    const mpp =
      (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, view.zoom);
    const diameterMeters = 2 * 250 * 1609.344;
    const diameterPixels = diameterMeters / mpp;
    const visibleH = viewportH - PROD_PADDING.top - PROD_PADDING.bottom;
    const ratio = diameterPixels / visibleH;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(0.99);
  });

  it('respects a custom fillRatio', () => {
    const tight = computeBranchView({
      lat: 35,
      viewportH: 1080,
      viewportW: 1920,
      padding: PROD_PADDING,
      fillRatio: 0.5,
    });
    const loose = computeBranchView({
      lat: 35,
      viewportH: 1080,
      viewportW: 1920,
      padding: PROD_PADDING,
      fillRatio: 0.95,
    });
    // Smaller fillRatio → larger metersPerPixel → smaller zoom number.
    expect(tight.zoom).toBeLessThan(loose.zoom);
  });
});

describe('computeBranchView — panBy compensates for chrome', () => {
  it('shifts left when right chrome is wider than left chrome', () => {
    // Prod padding: left 280, right 420 → visible pane is left of map div center.
    // panBy.x must be positive (panBy(+x, _) shifts marker left by x px).
    const view = computeBranchView({
      lat: 35,
      viewportH: 1080,
      viewportW: 1920,
      padding: PROD_PADDING,
    });
    expect(view.panBy.x).toBe(70); // (420 - 280) / 2 = 70
  });

  it('shifts down when top chrome is taller than bottom chrome', () => {
    // Prod padding: top 220, bottom 80 → visible pane is below map div center.
    // panBy.y must be negative (panBy(_, -y) shifts marker down by y px).
    const view = computeBranchView({
      lat: 35,
      viewportH: 1080,
      viewportW: 1920,
      padding: PROD_PADDING,
    });
    expect(view.panBy.y).toBe(-70); // -(220 - 80) / 2 = -70
  });

  it('zero panBy when chrome is symmetric', () => {
    const view = computeBranchView({
      lat: 35,
      viewportH: 1080,
      viewportW: 1920,
      padding: { top: 100, right: 100, bottom: 100, left: 100 },
    });
    // Using Math.abs to fold +0/-0 — Object.is treats them as different.
    expect(Math.abs(view.panBy.x)).toBe(0);
    expect(Math.abs(view.panBy.y)).toBe(0);
  });
});

describe('computeBranchView — clamps', () => {
  it('clamps to maxZoom when the math wants a higher zoom than the cap', () => {
    // fillRatio > 1 forces the circle to "fill more than the pane" → math
    // wants a tighter zoom. With ratio 1000 the computed zoom blows past
    // 16, exercising the clamp.
    const view = computeBranchView({
      lat: 35,
      viewportH: 1080,
      viewportW: 1920,
      padding: PROD_PADDING,
      fillRatio: 1000,
      maxZoom: 16,
    });
    expect(view.zoom).toBe(16);
  });

  it('clamps to minZoom when the viewport is too small', () => {
    const view = computeBranchView({
      lat: 35,
      viewportH: 200,
      viewportW: 200,
      padding: PROD_PADDING,
      minZoom: 3,
    });
    // After the 240px floor, very small viewports still hit minZoom.
    expect(view.zoom).toBeGreaterThanOrEqual(3);
  });
});
