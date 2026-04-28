'use client';

// BranchMarker — square + ring + code label, drawn in SVG-space (viewBox 0-900 × 0-540).
// Mirrors the prototype's default 'square' branch marker.

import * as React from 'react';

const MAP_INK = '#e6e9ef';
const MAP_BG = '#0e1116';
const MONO = 'var(--font-jetbrains-mono), ui-monospace, monospace';

export interface BranchMarkerProps {
  x: number;
  y: number;
  code: string;
  selected?: boolean;
  onClick?: () => void;
}

export function BranchMarker({ x, y, code, selected, onClick }: BranchMarkerProps) {
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      {selected && (
        <circle cx={x} cy={y} r="14" fill="none" stroke={MAP_INK} strokeWidth="0.5" opacity="0.5" />
      )}
      <rect x={x - 5} y={y - 5} width="10" height="10" fill={MAP_INK} stroke={MAP_BG} strokeWidth="2" />
      <rect x={x - 6} y={y - 6} width="12" height="12" fill="none" stroke={MAP_INK} strokeWidth="0.5" />
      <text
        x={x + 10}
        y={y + 3}
        fill={MAP_INK}
        fontSize="9"
        fontWeight="600"
        fontFamily={MONO}
        letterSpacing="0.06em"
      >
        {code}
      </text>
    </g>
  );
}
