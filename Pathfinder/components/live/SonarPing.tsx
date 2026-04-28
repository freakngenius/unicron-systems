'use client';

// SonarPing — SVG element. Renders inside the parent SVG; expanding ring
// from r=4 to r=22 over 700ms, opacity 0.75 → 0. Uses native SVG <animate>
// elements (no CSS) so the timing is independent of the parent's repaint.
//
// Stream 3's Map.tsx renders one of these for any project ID in `useNewPins()`.

import React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';

export interface SonarPingProps {
  x: number;
  y: number;
  color?: string;
}

export function SonarPing({ x, y, color }: SonarPingProps) {
  const stroke = color || PF_TINTS.hi;
  return (
    <circle cx={x} cy={y} r={4} fill="none" stroke={stroke} strokeWidth={1}>
      <animate attributeName="r" from="3" to="22" dur="700ms" fill="freeze" />
      <animate attributeName="opacity" from="0.75" to="0" dur="700ms" fill="freeze" />
    </circle>
  );
}

export default SonarPing;
