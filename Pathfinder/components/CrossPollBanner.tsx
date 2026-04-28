'use client';

// CrossPollBanner — bottom-center banner that appears when cross-pollination is active.
// Mirrors `CrossPollBanner` in `pathfinder-prototype/project/hifi-shell.jsx`.

import * as React from 'react';

const PF = {
  warm: '#a3e635',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

export interface CrossPollBannerProps {
  count: number;
}

export function CrossPollBanner({ count }: CrossPollBannerProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 272,
        right: 412,
        bottom: 64,
        background: 'rgba(14,17,22,0.92)',
        backdropFilter: 'blur(6px)',
        border: `1px solid ${PF.warm}`,
        borderRadius: 5,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        zIndex: 4,
        boxShadow: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          background: PF.warm,
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }}
      />
      <span
        className="pf-mono"
        style={{
          fontSize: 11,
          color: '#f5efe0',
          letterSpacing: '0.02em',
          textAlign: 'center',
        }}
      >
        {count} warm-intro candidates · customers within 50mi of an opportunity served by another
        branch
      </span>
    </div>
  );
}
