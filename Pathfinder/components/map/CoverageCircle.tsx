'use client';

// CoverageCircle — viewport-relative focus ring around the selected branch.
//
// We deliberately don't use google.maps.Circle here. A geographic 300mi
// circle (real coverage radius) renders very differently at zoom 7 vs.
// zoom 11 — at zoom 7 it spans multiple states, at zoom 11 it fills the
// whole window edge-to-edge. Since the auto-zoom now fits the branch's
// projects, the circle should read as a "focus area" indicator that stays
// the same on-screen size regardless of zoom.
//
// Implementation: project the branch lat/lng to container pixels via the
// existing `useLatLngToPixel` hook and render a CSS circle at fixed pixel
// dimensions. The container's resize observer keeps the diameter sized as
// a fraction of the smaller viewport axis so it feels right on iPad
// landscape AND a 27" desktop without manual tuning.

import * as React from 'react';
import { useLatLngToPixel } from './useLatLngToPixel';

const HI = '#22d3ee';

export interface CoverageCircleProps {
  lat: number;
  lng: number;
  /** Diameter as a fraction of `min(containerW, containerH)`. Defaults to 0.55. */
  fraction?: number;
  /** Hard min/max in pixels so the ring stays sensible at extreme aspect ratios. */
  minPx?: number;
  maxPx?: number;
}

export function CoverageCircle({
  lat,
  lng,
  fraction = 0.55,
  minPx = 220,
  maxPx = 520,
}: CoverageCircleProps) {
  const px = useLatLngToPixel(lat, lng);
  const [viewport, setViewport] = React.useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!px) return null;
  const diameter = Math.min(maxPx, Math.max(minPx, Math.min(viewport.w, viewport.h) * fraction));
  return (
    <div
      style={{
        position: 'absolute',
        left: px.x - diameter / 2,
        top: px.y - diameter / 2,
        width: diameter,
        height: diameter,
        borderRadius: '50%',
        background: `radial-gradient(circle at center, ${hexAlpha(HI, 0.10)} 0%, ${hexAlpha(HI, 0.04)} 60%, transparent 100%)`,
        border: `1px dashed ${hexAlpha(HI, 0.55)}`,
        pointerEvents: 'none',
        zIndex: 2,
        transition: 'left 220ms ease-out, top 220ms ease-out, width 220ms ease-out, height 220ms ease-out',
      }}
      aria-hidden="true"
    />
  );
}

function hexAlpha(hex: string, a: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
