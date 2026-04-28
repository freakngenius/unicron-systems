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

const MAP_BG = '#0e1116';

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
      const icon: google.maps.Symbol = {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: m.color,
        fillOpacity: 1,
        strokeColor: MAP_BG,
        strokeWeight: 1.5,
        scale: m.hi ? 7 : 5,
      };
      const marker = new google.maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        icon,
        zIndex: m.hi ? 100 : 10,
      });
      marker.addListener('click', m.onClick);
      refsRef.current.set(m.id, marker);
      return marker;
    });

    const clusterer = new MarkerClusterer({
      map,
      markers: built as unknown as ClustererMarker[],
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
            zIndex: 200,
          });
        },
      },
    });
    clustererRef.current = clusterer;

    const refs = refsRef.current;
    return () => {
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
