'use client';

// MapController — receives the dashboard's intent (selected branch, "See All"
// trigger, manual zoom step) and translates it into imperative Google Maps
// calls (panTo, setZoom). Renders no DOM; lives inside <Map> so it
// can grab the map instance via useMap().

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import type { Branch } from '@/lib/types';
import { computeBranchView } from '@/lib/geography/branch-view';

// Pixels eaten by the chrome panels on each edge of the map div.
//   top    — TopBar (52) + agent status row (~120) + 24 buffer
//   right  — ProjectList (380) + 16 + 24 buffer
//   bottom — ActivityRail collapsed (52) + 16 + 12 buffer
//   left   — BranchDock (240) + 16 + 24 buffer
const CHROME_PADDING = { top: 220, right: 420, bottom: 80, left: 280 };

export interface MapControllerProps {
  branches: Branch[];
  /**
   * @deprecated No longer used — branch focus now uses a deterministic
   * camera based on branch lat/lng + viewport only (Gate 12I). Kept on
   * the type until callers stop passing it; treat as ignored.
   */
  projects?: unknown[];
  /** Currently focused branch id; null = "See All" (recenters on the default
   * US center at the default zoom). */
  selectedBranchId: string | null;
  /** Bumps when the user clicks "See All" or selects a branch to force a re-fit. */
  focusKey: number;
  /** Receives the live map instance so the dashboard can wire ZoomControl + map-click handlers. */
  onMapReady?: (map: google.maps.Map | null) => void;
  /** Used in See All mode — pan to this center and use this zoom instead of
   * fit-bounds (gives a stable, predictable initial / reset view). */
  defaultCenter: { lat: number; lng: number };
  defaultZoom: number;
}

export function MapController({
  branches,
  selectedBranchId,
  focusKey,
  onMapReady,
  defaultCenter,
  defaultZoom,
}: MapControllerProps) {
  const map = useMap();

  React.useEffect(() => {
    onMapReady?.(map ?? null);
  }, [map, onMapReady]);

  // Enable fractional zoom so computed zoom levels (often e.g. 6.84 at
  // typical US latitudes for the 250mi coverage circle) aren't snapped
  // to the nearest integer. Without this, the raster map rounds to 7
  // and the circle bleeds past the chrome.
  React.useEffect(() => {
    if (!map) return;
    map.setOptions({ isFractionalZoomEnabled: true });
  }, [map]);

  React.useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    if (selectedBranchId === null) {
      // ── See All — fixed center/zoom at the configured CONUS view. We used
      // fit-bounds previously, but the result jittered with viewport size and
      // could overshoot when branches were tightly clustered. A fixed view is
      // more predictable for the initial state + every "See All" reset.
      map.panTo(defaultCenter);
      map.setZoom(defaultZoom);
      return;
    }

    // ── Branch focus — deterministic camera based ONLY on the branch
    // lat/lng + viewport. Project pins are NOT used — that's what made
    // every branch zoom differently before (LA had a far-flung pin that
    // blew out the bounds). The 250mi coverage circle should fill the
    // visible pane vertically, regardless of where the branch's leads
    // happen to be.
    const branch = branches.find((b) => b.id === selectedBranchId);
    if (!branch) return;

    const view = computeBranchView({
      lat: branch.lat,
      viewportH: window.innerHeight,
      viewportW: window.innerWidth,
      padding: CHROME_PADDING,
      minZoom: 3,
      maxZoom: 16,
    });

    map.setZoom(view.zoom);
    map.panTo({ lat: branch.lat, lng: branch.lon });
    // Compensate for asymmetric chrome — without this the branch would
    // sit at the map div center, which is not the same as the visible
    // pane center because the right ProjectList (420px) is wider than
    // the left BranchDock (280px), and the top chrome (220px) is taller
    // than the bottom chrome (80px).
    map.panBy(view.panBy.x, view.panBy.y);
    // focusKey bumps re-trigger the fit even when selectedBranchId stays the same
    // (e.g. user clicks the already-selected branch — the user expects re-centering).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedBranchId, focusKey, branches.length]);

  return null;
}
