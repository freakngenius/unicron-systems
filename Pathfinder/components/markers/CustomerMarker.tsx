'use client';

// CustomerMarker — small ring with a center dot. Drawn in SVG-space.
// Mirrors the prototype's CustomerMarker.

import * as React from 'react';

const MAP_INK_DIM = '#9aa3b2';
const WARM = '#a3e635';

export interface CustomerMarkerProps {
  x: number;
  y: number;
  warm?: boolean;
  dimmed?: boolean;
}

export function CustomerMarker({ x, y, warm, dimmed }: CustomerMarkerProps) {
  const color = warm ? WARM : MAP_INK_DIM;
  return (
    <g opacity={dimmed ? 0.4 : 1}>
      <circle cx={x} cy={y} r="4" fill="none" stroke={color} strokeWidth="1" />
      <circle cx={x} cy={y} r="1.5" fill={color} />
    </g>
  );
}
