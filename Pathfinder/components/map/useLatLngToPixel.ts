'use client';

// Hook that converts a (lat, lng) into the map container's pixel coordinates,
// recomputing on every camera change so DOM overlays anchored to a real-world
// point (e.g. AnchoredBranchCard) stay glued to that point through pan + zoom.

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';

export function useLatLngToPixel(lat: number | null, lng: number | null): {
  x: number;
  y: number;
} | null {
  const map = useMap();
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!map || lat == null || lng == null || typeof google === 'undefined') {
      setCoords(null);
      return;
    }

    const compute = () => {
      // Use the container projection — gives container-relative pixel coords
      // that account for current zoom + center.
      const proj = map.getProjection();
      if (!proj) return;
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      if (!bounds || zoom == null) return;

      const target = new google.maps.LatLng(lat, lng);
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const targetPt = proj.fromLatLngToPoint(target);
      const nePt = proj.fromLatLngToPoint(ne);
      const swPt = proj.fromLatLngToPoint(sw);
      if (!targetPt || !nePt || !swPt) return;

      const div = map.getDiv();
      const w = div.clientWidth;
      const h = div.clientHeight;
      const scale = Math.pow(2, zoom);
      // World coordinates are 0..256 across the equator; multiply by 2^zoom for px.
      const px = (targetPt.x - swPt.x) * scale;
      const py = (targetPt.y - nePt.y) * scale;
      // The map div spans (sw.x → ne.x) in world coords; the visible viewport
      // is the same range in pixel coords. So container-pixel === computed value.
      // Clamp `out-of-frame` overlays just outside the bounds so they fade.
      if (px < -200 || px > w + 200 || py < -200 || py > h + 200) {
        setCoords(null);
      } else {
        setCoords({ x: px, y: py });
      }
    };

    compute();
    const listeners = [
      map.addListener('bounds_changed', compute),
      map.addListener('zoom_changed', compute),
      map.addListener('center_changed', compute),
      map.addListener('drag', compute),
    ];
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(compute)
        : null;
    if (ro) ro.observe(map.getDiv());
    return () => {
      listeners.forEach((l) => l.remove());
      ro?.disconnect();
    };
  }, [map, lat, lng]);

  return coords;
}
