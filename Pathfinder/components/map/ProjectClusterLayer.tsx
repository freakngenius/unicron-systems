'use client';

// ProjectClusterLayer — drives @googlemaps/markerclusterer over native
// google.maps.Marker instances. Below the spiderfy threshold zoom, nearby
// markers collapse into a count badge (clicking zooms to fit). Above the
// threshold, individual markers render with the same tier-tinted dot style
// the legacy Marker components use.

import * as React from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer, type Marker as ClustererMarker } from '@googlemaps/markerclusterer';
import { TIER_COLORS } from '@/lib/types-map';
import { projectCrossIcon } from './MapMarkers';

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
  spiderfyZoom?: number;
}

export function ProjectClusterLayer({ markers, spiderfyZoom = 10 }: ProjectClusterLayerProps) {
  const map = useMap();
  const clustererRef = React.useRef<MarkerClusterer | null>(null);
  const refsRef = React.useRef<Map<string, google.maps.Marker>>(new Map());

  React.useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    const offsetMarkers = spiderfyOverlaps(markers, spiderfyZoom, map.getZoom() ?? spiderfyZoom);

    const built: google.maps.Marker[] = offsetMarkers.map((m) => {
      const icon = projectCrossIcon(m.color, m.hi);
      const marker = new google.maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        icon: icon ?? undefined,
        zIndex: m.hi ? 100 : 10,
      });
      marker.addListener('click', m.onClick);
      refsRef.current.set(m.id, marker);
      return marker;
    });

    const clusterer = new MarkerClusterer({
      map,
      markers: built as unknown as ClustererMarker[],
      // Cluster click → zoom-to-disaggregate. The library default does
      // `map.fitBounds(cluster.bounds)`, but in Houston-only demo mode many
      // leads share the exact same lat/lng (single permit / contract block),
      // producing zero-area bounds — fitBounds is a no-op and the click
      // appears to do nothing. We handle three cases explicitly:
      //   1. zero-area bounds → bump zoom +2 so spiderfy spreads the stack;
      //   2. real bounds → fitBounds with 80px padding;
      //   3. missing bounds → pan + zoom +2 at the cluster position.
      onClusterClick: (_event, cluster, mapInstance) => {
        const z = mapInstance.getZoom() ?? spiderfyZoom;
        const bumpZoom = Math.max(z + 2, spiderfyZoom + 1);
        if (!cluster.bounds) {
          mapInstance.panTo(cluster.position);
          mapInstance.setZoom(bumpZoom);
          return;
        }
        const ne = cluster.bounds.getNorthEast();
        const sw = cluster.bounds.getSouthWest();
        const zeroArea = ne.lat() === sw.lat() && ne.lng() === sw.lng();
        if (zeroArea) {
          mapInstance.panTo(cluster.position);
          mapInstance.setZoom(bumpZoom);
          return;
        }
        mapInstance.fitBounds(cluster.bounds, 80);
      },
      renderer: {
        render: ({ count, position }) => {
          const size = 30 + Math.min(count, 50);
          const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
              <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${TIER_COLORS.cobalt}" fill-opacity="0.18" stroke="${TIER_COLORS.cobalt}" stroke-width="1.5"/>
              <text x="${size / 2}" y="${size / 2 + 4}" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="12" font-weight="700" fill="#e6e9ef" text-anchor="middle">${count}</text>
            </svg>`;
          return new google.maps.Marker({
            position,
            icon: {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
              scaledSize: new google.maps.Size(size, size),
              anchor: new google.maps.Point(size / 2, size / 2),
            },
            // Cursor hint so the cluster reads as clickable. (The default
            // marker cursor is the open hand; pointer makes the affordance
            // explicit and matches branch / lead pin cursors.)
            cursor: 'pointer',
            zIndex: 200,
          });
        },
      },
    });
    clustererRef.current = clusterer;

    // Re-spiderfy on zoom change. spiderfyOverlaps is computed once from
    // the input `markers`, so the offset positions baked into `built[]`
    // were calibrated for the zoom at construct time. After a cluster
    // click bumps zoom past `spiderfyZoom`, the stacked markers need to
    // spread out — without this listener they stay collinear and re-cluster.
    // The next idle event (auto-fired by the clusterer's internal listener)
    // will recompute clusters with the updated positions.
    const zoomListener = map.addListener('zoom_changed', () => {
      const newZoom = map.getZoom() ?? spiderfyZoom;
      const respread = spiderfyOverlaps(markers, spiderfyZoom, newZoom);
      respread.forEach((m, i) => {
        const target = built[i];
        if (target) target.setPosition({ lat: m.lat, lng: m.lng });
      });
    });

    const refs = refsRef.current;
    return () => {
      google.maps.event.removeListener(zoomListener);
      clusterer.clearMarkers();
      built.forEach((m) => m.setMap(null));
      refs.clear();
      clustererRef.current = null;
    };
  }, [map, markers, spiderfyZoom]);

  return null;
}

function spiderfyOverlaps(
  markers: ClusterMarker[],
  spiderfyZoom: number,
  currentZoom: number,
): ClusterMarker[] {
  if (markers.length === 0) return markers;
  if (currentZoom < spiderfyZoom) return markers;

  const SAME_THRESHOLD_DEG = 0.001;
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
