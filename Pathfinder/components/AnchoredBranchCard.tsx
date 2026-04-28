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
  /** Container dimensions (used to clamp the card inside the map free zone). */
  containerW: number;
  containerH: number;
  /** Top of the map free zone (under TopBar + AgentStatusRow). */
  headerH: number;
  /** Right edge of the BranchDock (left wall of the free zone). */
  freeLeft?: number;
  /** Left edge of the ProjectList (right wall of the free zone). */
  freeRight?: number;
  inRangeCount: number;
  hiCount: number;
  customerCount: number;
}

const CARD_W = 240;
const CARD_H = 200; // approximate; used for vertical clamping
const ANCHOR_GAP = 16; // gap between pin and card edge along the chosen side
const EDGE_PAD = 8;

export function AnchoredBranchCard({
  branch,
  anchorPx,
  containerW,
  containerH,
  headerH,
  freeLeft = 272,
  freeRight,
  inRangeCount,
  hiCount,
  customerCount,
}: AnchoredBranchCardProps) {
  const rightWall = (freeRight ?? containerW - 412);
  const minLeft = freeLeft + EDGE_PAD;
  const maxLeft = rightWall - CARD_W - EDGE_PAD;
  const minTop = headerH + EDGE_PAD;
  const maxTop = containerH - CARD_H - EDGE_PAD;

  // Prefer right of pin. Flip to left if right would overflow. Then clamp.
  const wantRight = anchorPx.x + ANCHOR_GAP;
  const wantLeftFlip = anchorPx.x - ANCHOR_GAP - CARD_W;
  const placeOnLeft = wantRight + CARD_W > rightWall - EDGE_PAD && wantLeftFlip >= minLeft;
  const rawLeft = placeOnLeft ? wantLeftFlip : wantRight;
  const left = Math.min(Math.max(rawLeft, minLeft), Math.max(minLeft, maxLeft));

  const wantTop = anchorPx.y - 72;
  const top = Math.min(Math.max(wantTop, minTop), Math.max(minTop, maxTop));

  // Tail line: thin black segment from the card edge back toward the pin (horizontal only,
  // intentionally not drawn through the card). When the card is forced away from the pin
  // by clamping, the tail stops at the card edge — we don't draw a line that would cross
  // a side panel.
  const cardCenterY = top + 24; // align with card's first label row
  const tailY = Math.min(Math.max(anchorPx.y, top + 4), top + CARD_H - 4);
  const tailFromX = placeOnLeft ? left + CARD_W : left;
  const tailToX = placeOnLeft
    ? Math.max(anchorPx.x, tailFromX)
    : Math.min(anchorPx.x, tailFromX);

  return (
    <>
      {/* Tail — drawn relative to the container, not the card, so it can reach the pin
          even when the card is clamped. Suppress when flush against the side panel
          (would visually look like a stray rule). */}
      {Math.abs(tailToX - tailFromX) > 4 && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tailFromX, tailToX),
            top: tailY,
            width: Math.abs(tailToX - tailFromX),
            height: 1,
            background: PF.ink,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: CARD_W,
          background: PF.bg,
          border: `1px solid ${PF.ink}`,
          borderRadius: 5,
          boxShadow: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
          padding: 14,
          zIndex: 3,
        }}
      >
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
    </>
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
