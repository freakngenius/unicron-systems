// lib/geography/branch-view.ts — Demo Polish UX Gate 12I.
//
// Pure helper that computes the camera state (zoom + post-pan offset)
// needed to put a branch's coverage circle (default 250-mile radius) at
// the visual center of the visible map pane, with the circle filling
// most of the pane height.
//
// Pulled out of MapController so the math is unit-testable without a
// live Google Maps instance.

/**
 * Padding (in CSS pixels) that the chrome panels eat from each edge of
 * the map div. Mirrors the FIT_PADDING values in MapController. Used
 * here to:
 *   1. Compute the visible pane height (innerH − top − bottom).
 *   2. Compute the post-panTo offset that re-centers the branch on the
 *      visible-pane center rather than the map div center.
 */
export interface ChromePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ComputeBranchViewArgs {
  /** Branch latitude in degrees. */
  lat: number;
  /** Window inner height in CSS pixels. */
  viewportH: number;
  /** Window inner width in CSS pixels. Used as a fallback floor for
   * the visible width when computing minimum zoom. */
  viewportW: number;
  /** Pixels eaten by chrome on each edge of the map div. */
  padding: ChromePadding;
  /** Coverage circle radius in miles. Default 250 (Pathfinder field-office
   * coverage radius). */
  radiusMiles?: number;
  /** Fraction of the visible pane height the circle should fill. Default
   * 0.92 — leaves a small margin so the circle doesn't kiss the chrome. */
  fillRatio?: number;
  /** Min/max zoom clamps from the GoogleMap component. */
  minZoom?: number;
  maxZoom?: number;
}

export interface BranchView {
  /** Target zoom level (fractional — caller should ensure
   * `isFractionalZoomEnabled` is on the map for sub-integer precision;
   * otherwise the raster map will round). */
  zoom: number;
  /** After `map.panTo({lat, lng})`, call `map.panBy(panBy.x, panBy.y)`
   * to shift the branch onto the visible-pane center. Compensates for
   * asymmetric chrome (BranchDock left, ProjectList right, TopBar +
   * agent row top, ActivityRail bottom). */
  panBy: { x: number; y: number };
}

const METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392; // Google Web Mercator
const METERS_PER_MILE = 1609.344;

export function computeBranchView({
  lat,
  viewportH,
  viewportW,
  padding,
  radiusMiles = 250,
  fillRatio = 0.92,
  minZoom = 3,
  maxZoom = 16,
}: ComputeBranchViewArgs): BranchView {
  // Visible pane height between top and bottom chrome. Floor at 240px
  // so a half-collapsed window doesn't blow up the zoom.
  const visibleH = Math.max(240, viewportH - padding.top - padding.bottom);
  const visibleW = Math.max(240, viewportW - padding.left - padding.right);

  // 250-mile radius → 500-mile diameter ≈ 804,672 m.
  const diameterMeters = 2 * radiusMiles * METERS_PER_MILE;

  // Target meters/pixel so the diameter fills `fillRatio` of the pane
  // height. Also check width — on very narrow panes the circle must fit
  // horizontally too, so pick the more conservative (larger) mpp.
  const targetMppFromHeight = diameterMeters / (visibleH * fillRatio);
  const targetMppFromWidth = diameterMeters / (visibleW * fillRatio);
  const targetMpp = Math.max(targetMppFromHeight, targetMppFromWidth);

  // mpp at zoom 0 scales by cos(latitude) (Web Mercator). At zoom z,
  // mpp = mpp0 / 2^z, so z = log2(mpp0 / target_mpp).
  const mppAtZoom0 =
    METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((lat * Math.PI) / 180);
  const rawZoom = Math.log2(mppAtZoom0 / targetMpp);
  const zoom = Math.min(maxZoom, Math.max(minZoom, rawZoom));

  // Re-center math: visible pane center is at (left + visibleW/2,
  // top + visibleH/2); map div center is at (innerW/2, innerH/2). The
  // delta between them is the offset we need the branch to end up at
  // (relative to map div center).
  //   offsetX = (left − right) / 2  → negative if right chrome is wider
  //   offsetY = (top − bottom) / 2  → positive if top chrome is taller
  // After `panTo(branch)` the branch sits at map div center. To move it
  // by (offsetX, offsetY), call `panBy(−offsetX, −offsetY)` because
  // panBy(x, y) shifts the marker by (−x, −y).
  const offsetX = (padding.left - padding.right) / 2;
  const offsetY = (padding.top - padding.bottom) / 2;
  return {
    zoom,
    panBy: { x: -offsetX, y: -offsetY },
  };
}
