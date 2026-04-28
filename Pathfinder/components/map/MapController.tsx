'use client';

// MapController — receives the dashboard's intent (selected branch, "See All"
// trigger, manual zoom step) and translates it into imperative Google Maps
// calls (panTo, setZoom, fitBounds). Renders no DOM; lives inside <Map> so it
// can grab the map instance via useMap().

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import type { Branch } from '@/lib/types';

const BRANCH_FOCUS_ZOOM = 7; // ~300mi visible coverage circle fills the viewport

export interface MapControllerProps {
  branches: Branch[];
  /** Currently focused branch id; null = "See All" (fit-bounds across every branch). */
  selectedBranchId: string | null;
  /** Bumps when the user clicks "See All" or selects a branch to force a re-fit. */
  focusKey: number;
  /** Receives the live map instance so the dashboard can wire ZoomControl + space-pan-out hooks. */
  onMapReady?: (map: google.maps.Map | null) => void;
}

export function MapController({
  branches,
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
      // See All — fit to every branch with padding so coverage circles stay in view.
      if (branches.length === 0) return;
      const bounds = new google.maps.LatLngBounds();
      branches.forEach((b) => bounds.extend({ lat: b.lat, lng: b.lon }));
      // Pad ~3 degrees so 300mi coverage circles around edge branches still fit.
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      bounds.extend({ lat: ne.lat() + 3, lng: ne.lng() + 3 });
      bounds.extend({ lat: sw.lat() - 3, lng: sw.lng() - 3 });
      map.fitBounds(bounds, { top: 220, right: 420, bottom: 80, left: 280 });
    } else {
      const branch = branches.find((b) => b.id === selectedBranchId);
      if (!branch) return;
      map.panTo({ lat: branch.lat, lng: branch.lon });
      map.setZoom(BRANCH_FOCUS_ZOOM);
    }
    // focusKey bumps re-trigger the fit even when selectedBranchId stays the same
    // (e.g. user clicks the already-selected branch — the user expects re-centering).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedBranchId, focusKey, branches.length]);

  return null;
}
