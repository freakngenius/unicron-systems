'use client';

// CoverageCircle — translucent dashed cyan circle around a branch's lat/lon at
// the configured radius (default 300 statute miles). Uses a real
// google.maps.Circle overlay so it scales correctly with the Google Maps zoom.

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';

const HI = '#22d3ee';
const MILES_TO_METERS = 1609.344;

export interface CoverageCircleProps {
  lat: number;
  lng: number;
  miles?: number;
}

export function CoverageCircle({ lat, lng, miles = 300 }: CoverageCircleProps) {
  const map = useMap();
  const circleRef = React.useRef<google.maps.Circle | null>(null);

  React.useEffect(() => {
    if (!map || typeof google === 'undefined') return;
    const circle = new google.maps.Circle({
      map,
      center: { lat, lng },
      radius: miles * MILES_TO_METERS,
      fillColor: HI,
      fillOpacity: 0.06,
      strokeColor: HI,
      strokeOpacity: 0.7,
      strokeWeight: 1,
      // Google Maps doesn't support real dash patterns on Circle stroke without
      // SymbolPath polylines. The thin solid stroke + low fill keeps the
      // emphasis subtle without the dash hack.
      clickable: false,
      zIndex: 1,
    });
    circleRef.current = circle;
    return () => {
      circle.setMap(null);
      circleRef.current = null;
    };
  }, [map, lat, lng, miles]);

  return null;
}
