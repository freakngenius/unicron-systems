'use client';

// MapController — receives the dashboard's intent (selected branch, "See All"
// trigger, manual zoom step) and translates it into imperative Google Maps
// calls (panTo, setZoom, fitBounds). Renders no DOM; lives inside <Map> so it
// can grab the map instance via useMap().

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import type { Branch, Project } from '@/lib/types';

// Padding around fit-bounds operations so chrome panels don't cover content.
//   top    — TopBar (52) + agent status row (~120) + 24 buffer
//   right  — ProjectList (380) + 16 + 24 buffer
//   bottom — ActivityRail collapsed (52) + 16 + 12 buffer
//   left   — BranchDock (240) + 16 + 24 buffer
const FIT_PADDING = { top: 220, right: 420, bottom: 80, left: 280 };

// Edge buffer in degrees so the focus area doesn't sit flush with the panel edges.
const SEE_ALL_BUFFER_DEG = 3;
const BRANCH_FIT_BUFFER_DEG = 0.5;

export interface MapControllerProps {
  branches: Branch[];
  projects: Project[];
  /** Currently focused branch id; null = "See All" (fit-bounds across every branch). */
  selectedBranchId: string | null;
  /** Bumps when the user clicks "See All" or selects a branch to force a re-fit. */
  focusKey: number;
  /** Receives the live map instance so the dashboard can wire ZoomControl + map-click handlers. */
  onMapReady?: (map: google.maps.Map | null) => void;
}

export function MapController({
  branches,
  projects,
  selectedBranchId,
  focusKey,
  onMapReady,
}: MapControllerProps) {
  const map = useMap();

  React.useEffect(() => {
    onMapReady?.(map ?? null);
  }, [map, onMapReady]);

  React.useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    if (selectedBranchId === null) {
      // ── See All — fit every branch into view with side-panel padding ──
      if (branches.length === 0) return;
      const bounds = new google.maps.LatLngBounds();
      branches.forEach((b) => bounds.extend({ lat: b.lat, lng: b.lon }));
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      bounds.extend({ lat: ne.lat() + SEE_ALL_BUFFER_DEG, lng: ne.lng() + SEE_ALL_BUFFER_DEG });
      bounds.extend({ lat: sw.lat() - SEE_ALL_BUFFER_DEG, lng: sw.lng() - SEE_ALL_BUFFER_DEG });
      map.fitBounds(bounds, FIT_PADDING);
      return;
    }

    // ── Branch focus — fit branch lat/lng + every project assigned to that branch.
    // The 300mi coverage circle is now a viewport-relative DOM ring, so we no
    // longer pad to fit it; we pad just enough to keep projects from sitting on
    // the chrome edges and zoom in tight on the actual cluster.
    const branch = branches.find((b) => b.id === selectedBranchId);
    if (!branch) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: branch.lat, lng: branch.lon });
    const branchProjects = projects.filter(
      (p) => p.nearest_branch_id === selectedBranchId && p.lat != null && p.lon != null,
    );
    branchProjects.forEach((p) => {
      bounds.extend({ lat: p.lat as number, lng: p.lon as number });
    });
    // Small geographic buffer so pins don't kiss the panel edges
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    bounds.extend({
      lat: ne.lat() + BRANCH_FIT_BUFFER_DEG,
      lng: ne.lng() + BRANCH_FIT_BUFFER_DEG,
    });
    bounds.extend({
      lat: sw.lat() - BRANCH_FIT_BUFFER_DEG,
      lng: sw.lng() - BRANCH_FIT_BUFFER_DEG,
    });

    map.fitBounds(bounds, FIT_PADDING);
    // focusKey bumps re-trigger the fit even when selectedBranchId stays the same
    // (e.g. user clicks the already-selected branch — the user expects re-centering).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedBranchId, focusKey, branches.length, projects.length]);

  return null;
}
