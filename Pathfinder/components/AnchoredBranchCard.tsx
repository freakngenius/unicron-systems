'use client';

// AnchoredBranchCard — small white card pinned next to the selected branch's pin.
// Mirrors `AnchoredBranchCard` in `pathfinder-prototype/project/hifi-shell.jsx`.

import * as React from 'react';
import type { Branch } from '@/lib/types';

const PF = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  hi: '#22d3ee',
  warm: '#a3e635',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

export interface AnchoredBranchCardProps {
  branch: Branch;
  /** Pixel-space coordinates of the branch pin in the container. */
  anchorPx: { x: number; y: number };
  inRangeCount: number;
  hiCount: number;
  customerCount: number;
}

export function AnchoredBranchCard({
  branch,
  anchorPx,
  inRangeCount,
  hiCount,
  customerCount,
}: AnchoredBranchCardProps) {
  const offset = { x: 28, y: -72 };
  const left = anchorPx.x + offset.x;
  const top = anchorPx.y + offset.y;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: 240,
        background: PF.bg,
        border: `1px solid ${PF.ink}`,
        borderRadius: 5,
        boxShadow: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
        padding: 14,
        zIndex: 3,
      }}
    >
      {/* Tail line back to pin */}
      <div
        style={{
          position: 'absolute',
          left: -offset.x + 1,
          top: -offset.y - 2,
          width: offset.x - 1,
          height: 1,
          background: PF.ink,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="pf-label">
          {branch.id} · {branch.region ?? ''}
        </span>
        <span className="pf-mono" style={{ fontSize: 9, color: PF.inkDim }}>
          SELECTED
        </span>
      </div>
      <div className="pf-h1" style={{ fontSize: 20, marginTop: 4 }}>
        {branch.name}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${PF.ruleSoft}`,
        }}
      >
        <Metric value={inRangeCount} label="In range" />
        <Metric value={hiCount} label="Hi-pri" accent={hiCount > 0 ? 'hi' : null} />
        <Metric value={customerCount} label="Customers" />
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1px solid ${PF.ruleSoft}`,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span className="pf-label" style={{ fontSize: 9 }}>
          Coverage
        </span>
        <span className="pf-mono" style={{ fontSize: 10, color: PF.ink }}>
          {branch.coverage_radius_miles} mi · {branch.lat.toFixed(2)}°N{' '}
          {Math.abs(branch.lon).toFixed(2)}°W
        </span>
      </div>
    </div>
  );
}

function Metric({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: 'hi' | 'warm' | null;
}) {
  const color = accent === 'hi' ? PF.hi : accent === 'warm' ? PF.warm : PF.ink;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="pf-num" style={{ fontSize: 18, color, lineHeight: 1 }}>
        {value}
      </span>
      <span className="pf-label" style={{ fontSize: 9 }}>
        {label}
      </span>
    </div>
  );
}
