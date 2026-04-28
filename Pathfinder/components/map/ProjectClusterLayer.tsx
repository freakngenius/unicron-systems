'use client';

// ProjectClusterLayer — drives @googlemaps/markerclusterer over the project
// AdvancedMarkers. Below a threshold zoom, nearby pins collapse into a count
// badge (clicking zooms to fit). Above the threshold, individual pins render.
//
// We render React `<AdvancedMarker>` children for individual pins (so the dot
// styling stays in code), then ALSO instantiate plain google.maps.marker
// AdvancedMarkerElements to feed the clusterer. The two run in parallel:
// when the clusterer is showing a cluster, we hide the corresponding React
// markers; when it's not, the React markers are visible. This keeps the
// styling unified while letting MarkerClusterer drive cluster math.

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer, type Marker } from '@googlemaps/markerclusterer';

export interface ClusterMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  hi: boolean;
  onClick: () => void;
}

export interface ProjectClusterLayerProps {
  markers: ClusterMarker[];
  /** Spread overlapping markers radially when zoomed in past this level. */
  spiderfyZoom?: number;
}

export function ProjectClusterLayer({ markers, spiderfyZoom = 10 }: ProjectClusterLayerProps) {
  const map = useMap();
  const clustererRef = React.useRef<MarkerClusterer | null>(null);
  const markerRefs = React.useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(
    new Map(),
  );

  React.useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.marker) return;

    const offsetMarkers = spiderfyOverlaps(markers, spiderfyZoom, map.getZoom() ?? spiderfyZoom);

    // Build native AdvancedMarkerElements for the clusterer.
    const built: google.maps.marker.AdvancedMarkerElement[] = offsetMarkers.map((m) => {
      // Custom DOM content matching the AdvancedMarker dot styling.
      const dot = document.createElement('div');
      dot.style.cssText = `
        width: ${m.hi ? 14 : 10}px;
        height: ${m.hi ? 14 : 10}px;
        border-radius: 50%;
        background: ${m.color};
        border: 1.5px solid #0e1116;
        box-shadow: ${m.hi ? `0 0 6px ${m.color}80` : 'none'};
        cursor: pointer;
      `;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: m.lat, lng: m.lng },
        content: dot,
        zIndex: m.hi ? 100 : 10,
      });
      marker.addListener('click', m.onClick);
      markerRefs.current.set(m.id, marker);
      return marker;
    });

    const clusterer = new MarkerClusterer({
      map,
      markers: built as unknown as Marker[],
      renderer: {
        render: ({ count, position }) => {
          const div = document.createElement('div');
          div.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: ${30 + Math.min(count, 50)}px;
            height: ${30 + Math.min(count, 50)}px;
            border-radius: 50%;
            background: rgba(34, 211, 238, 0.18);
            border: 1.5px solid #22d3ee;
            color: #e6e9ef;
            font: 600 12px var(--font-jetbrains-mono), ui-monospace, monospace;
            box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.10);
            cursor: pointer;
          `;
          div.textContent = String(count);
          return new google.maps.marker.AdvancedMarkerElement({
            position,
            content: div,
            zIndex: 200,
          });
        },
      },
    });
    clustererRef.current = clusterer;

    const refs = markerRefs.current;
    return () => {
      clusterer.clearMarkers();
      built.forEach((m) => {
        m.map = null;
      });
      refs.clear();
      clustererRef.current = null;
    };
  }, [map, markers, spiderfyZoom]);

  return null;
}

// Spiderfy: when two or more markers are within ~50m of each other, fan them out
// in a small radial pattern proportional to the current zoom. Operates on the
// original lat/lng list and returns a new list with offset coords. Simple and
// deterministic — no animation, but solves the visible "stacked pins" issue.
function spiderfyOverlaps(
  markers: ClusterMarker[],
  spiderfyZoom: number,
  currentZoom: number,
): ClusterMarker[] {
  if (markers.length === 0) return markers;
  // At low zoom the clusterer handles overlap. Only spiderfy at zoom >= threshold.
  if (currentZoom < spiderfyZoom) return markers;

  const SAME_THRESHOLD_DEG = 0.001; // ~110m — pins this close get fanned out
  const groups: ClusterMarker[][] = [];
  const used = new Set<string>();

  for (const m of markers) {
    if (used.has(m.id)) continue;
    const group = [m];
    used.add(m.id);
    for (const n of markers) {
      if (used.has(n.id)) continue;
      if (
        Math.abs(n.lat - m.lat) < SAME_THRESHOLD_DEG &&
        Math.abs(n.lng - m.lng) < SAME_THRESHOLD_DEG
      ) {
        group.push(n);
        used.add(n.id);
      }
    }
    groups.push(group);
  }

  const out: ClusterMarker[] = [];
  for (const g of groups) {
    if (g.length === 1) {
      out.push(g[0]);
      continue;
    }
    // Fan out in a circle around the centroid, radius scales with zoom: at higher
    // zoom levels we can nudge less because pixels-per-degree is high.
    const radius = 0.012 / Math.pow(2, Math.max(0, currentZoom - 8));
    const cx = g.reduce((s, m) => s + m.lat, 0) / g.length;
    const cy = g.reduce((s, m) => s + m.lng, 0) / g.length;
    g.forEach((m, i) => {
      const angle = (i / g.length) * Math.PI * 2;
      out.push({
        ...m,
        lat: cx + Math.cos(angle) * radius,
        lng: cy + Math.sin(angle) * radius,
      });
    });
  }
  return out;
}
