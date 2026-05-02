'use client';

// WarmIntroLines — draws magenta polylines from each customer to the project
// the system flagged as a warm-intro. Used only in cross-pollination mode.
// Mirrors the lime warm-line connectors from the prior SVG map.
//
// Demo Polish UX § Gate 2 — each line carries a `tier`:
//   - 'exact' (cross-pollination match_layer = 'exact', confidence ≥ 0.95)
//     renders as a SOLID full-opacity magenta line.
//   - 'fuzzy' (cross-pollination match_layer = 'fuzzy') renders as a DASHED
//     reduced-opacity magenta line.
// The MapLegend reflects the same two tiers so the demo can answer
// "how does the system know?" with a glance.

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { TIER_COLORS } from '@/lib/types-map';

export type WarmLineTier = 'exact' | 'fuzzy';

export interface WarmLine {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  /** 'exact' = solid magenta · 'fuzzy' = dashed faded magenta. Defaults to
   * 'fuzzy' when unspecified so the conservative styling wins by default. */
  tier?: WarmLineTier;
}

export interface WarmIntroLinesProps {
  lines: WarmLine[];
}

export function WarmIntroLines({ lines }: WarmIntroLinesProps) {
  const map = useMap();
  const polylinesRef = React.useRef<google.maps.Polyline[]>([]);

  React.useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    // Fuzzy match — dashed line via the SymbolPath-on-icons trick (the
    // closest Google Maps gets to a real CSS dash on a Polyline). Reduced
    // stroke opacity so the visual subordinates to exact matches when both
    // render on the map at once.
    const fuzzyDashSymbol: google.maps.IconSequence = {
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 0.55,
        strokeColor: TIER_COLORS.magenta,
        scale: 2,
      },
      offset: '0',
      repeat: '12px',
    };

    const created = lines.map((l) => {
      const tier: WarmLineTier = l.tier ?? 'fuzzy';
      if (tier === 'exact') {
        // Solid full-opacity stroke — no dash icons needed.
        return new google.maps.Polyline({
          map,
          path: [l.from, l.to],
          strokeColor: TIER_COLORS.magenta,
          strokeOpacity: 1,
          strokeWeight: 2,
          zIndex: 3,
          clickable: false,
        });
      }
      return new google.maps.Polyline({
        map,
        path: [l.from, l.to],
        strokeOpacity: 0,
        icons: [fuzzyDashSymbol],
        zIndex: 2,
        clickable: false,
      });
    });
    polylinesRef.current = created;

    return () => {
      created.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, lines]);

  return null;
}
