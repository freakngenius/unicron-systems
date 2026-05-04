'use client';

// CoverageCircle — geographic 300mi coverage radius around the selected branch.
//
// Renders a native `google.maps.Circle` with radius in meters so the circle
// represents a real geographic area (Galveston → Austin/San Antonio at the
// boundary for a Houston-anchored branch) and scales pixel-correctly with
// zoom. Drawing the circle inside the Google Maps canvas (via `useMap()`)
// rather than as a CSS DOM overlay means Google handles the lat/lng → pixel
// projection at every zoom level for us.
//
// Note: branch and lead pin markers are intentionally fixed-pixel-size and
// live in `MapMarkers.tsx` / `ProjectClusterLayer.tsx`. They are unaffected
// by this component — only the coverage *area* visualization scales.

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';

const HI = '#22d3ee';
const COVERAGE_RADIUS_MILES = 300;
const METERS_PER_MILE = 1609.344;

export interface CoverageCircleProps {
  lat: number;
  lng: number;
  /** Coverage radius in miles. Defaults to 300. */
  radiusMiles?: number;
}

export function CoverageCircle({
  lat,
  lng,
  radiusMiles = COVERAGE_RADIUS_MILES,
}: CoverageCircleProps) {
  const map = useMap();
  const circleRef = React.useRef<google.maps.Circle | null>(null);

  React.useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.Circle) return;

    const circle = new google.maps.Circle({
      map,
      center: { lat, lng },
      radius: radiusMiles * METERS_PER_MILE,
      strokeColor: HI,
      strokeOpacity: 0.55,
      strokeWeight: 1.5,
      fillColor: HI,
      fillOpacity: 0.08,
      clickable: false,
      zIndex: 2,
    });
    circleRef.current = circle;

    return () => {
      circle.setMap(null);
      circleRef.current = null;
    };
  }, [map, lat, lng, radiusMiles]);

  return null;
}
