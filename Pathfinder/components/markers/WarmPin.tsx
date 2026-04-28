'use client';

// WarmPin — diamond marker for cross-pollination warm-intro candidates.
// Drawn in SVG-space.

import * as React from 'react';

const WARM = '#a3e635';
const MAP_BG = '#0e1116';
const MONO = 'var(--font-jetbrains-mono), ui-monospace, monospace';

export interface WarmPinProps {
  x: number;
  y: number;
  label?: string;
  onClick?: () => void;
}

export function WarmPin({ x, y, label, onClick }: WarmPinProps) {
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      <circle cx={x} cy={y} r="9" fill={WARM} opacity="0.18" />
      <rect
        x={x - 4}
        y={y - 4}
        width="8"
        height="8"
        fill={WARM}
        transform={`rotate(45 ${x} ${y})`}
        stroke={MAP_BG}
        strokeWidth="0.5"
      />
      {label && (
        <text
          x={x + 10}
          y={y + 3}
          fill={WARM}
          fontSize="9"
          fontWeight="600"
          fontFamily={MONO}
          letterSpacing="0.06em"
        >
          {label}
        </text>
      )}
    </g>
  );
}
