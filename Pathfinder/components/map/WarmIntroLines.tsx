'use client';

// WarmIntroLines — draws magenta dashed polylines from each customer to the
// project the system flagged as a warm-intro. Used only in cross-pollination
// mode. Mirrors the lime warm-line connectors from the prior SVG map.

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { TIER_COLORS } from '@/lib/types-map';

export interface WarmLine {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

export interface WarmIntroLinesProps {
  lines: WarmLine[];
}

export function WarmIntroLines({ lines }: WarmIntroLinesProps) {
  const map = useMap();
  const polylinesRef = React.useRef<google.maps.Polyline[]>([]);

  React.useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    // Each polyline uses a dashed line via the SymbolPath-on-icons trick — the
    // closest Google Maps gets to a real CSS dash on a Polyline.
    const dashSymbol: google.maps.IconSequence = {
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        strokeColor: TIER_COLORS.magenta,
        scale: 2,
      },
      offset: '0',
      repeat: '12px',
    };

    const created = lines.map((l) => {
      const poly = new google.maps.Polyline({
        map,
        path: [l.from, l.to],
        strokeOpacity: 0,
        icons: [dashSymbol],
        zIndex: 2,
        clickable: false,
      });
      return poly;
    });
    polylinesRef.current = created;

    return () => {
      created.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, lines]);

  return null;
}
