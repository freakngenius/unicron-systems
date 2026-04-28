'use client';

// CoverageRadius — translucent dashed ring around a branch indicating its 300-mile
// coverage. Drawn in SVG-space; the visual radius is calibrated to read as ~300mi
// against the prototype's projection.

import * as React from 'react';

const HI = '#22d3ee';
const MAP_INK_DIM = '#9aa3b2';
const MONO = 'var(--font-jetbrains-mono), ui-monospace, monospace';

export interface CoverageRadiusProps {
  x: number;
  y: number;
  /** Visual radius in SVG units. Prototype uses 75 ≈ 300 mi. */
  rUnits?: number;
}

export function CoverageRadius({ x, y, rUnits = 75 }: CoverageRadiusProps) {
  return (
    <>
      <circle cx={x} cy={y} r={rUnits} fill={HI} opacity="0.06" />
      <circle
        cx={x}
        cy={y}
        r={rUnits}
        fill="none"
        stroke={HI}
        strokeWidth="0.6"
        strokeDasharray="2,3"
        opacity="0.7"
      />
      <text
        x={x}
        y={y - rUnits - 6}
        textAnchor="middle"
        fill={MAP_INK_DIM}
        fontSize="8"
        fontFamily={MONO}
        letterSpacing="0.08em"
      >
        300MI
      </text>
    </>
  );
}
