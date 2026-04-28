'use client';

// ProjectPin — small dot, cyan if high-priority. Drawn in SVG-space.
// Mirrors the prototype's default 'dot' project marker.

import * as React from 'react';

const HI = '#22d3ee';
const MAP_INK_DIM = '#9aa3b2';
const MAP_BG = '#0e1116';

export interface ProjectPinProps {
  x: number;
  y: number;
  hi?: boolean;
  onClick?: () => void;
}

export function ProjectPin({ x, y, hi, onClick }: ProjectPinProps) {
  const r = hi ? 4.5 : 3.2;
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      {hi && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={HI} strokeWidth="0.5" opacity="0.5" />}
      <circle cx={x} cy={y} r={r} fill={hi ? HI : MAP_INK_DIM} />
      {hi && <circle cx={x} cy={y} r={r} fill="none" stroke={MAP_BG} strokeWidth="0.5" />}
    </g>
  );
}
