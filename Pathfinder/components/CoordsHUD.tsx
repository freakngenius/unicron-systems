'use client';

// CoordsHUD — bottom-right map chip showing current branch coordinates and zoom.
// Mirrors `CoordsHUD` in `pathfinder-prototype/project/hifi-shell.jsx`.

import * as React from 'react';
import type { Branch } from '@/lib/types';

const PF = {
  mapInk: '#e6e9ef',
  mapInkDim: '#9aa3b2',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

export interface CoordsHUDProps {
  branch: Branch | null;
  zoom?: number;
}

export function CoordsHUD({ branch, zoom = 1 }: CoordsHUDProps) {
  if (!branch) return null;
  return (
    <div
      style={{
        position: 'absolute',
        right: 412,
        bottom: 16,
        background: 'rgba(14,17,22,0.85)',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 5,
        padding: '8px 12px',
        font: `500 10px ${PF.mono}`,
        letterSpacing: '0.06em',
        color: PF.mapInkDim,
        zIndex: 4,
      }}
    >
      <span style={{ color: PF.mapInk }}>
        {branch.lat.toFixed(4)}°N {Math.abs(branch.lon).toFixed(4)}°W
      </span>
    </div>
  );
}
