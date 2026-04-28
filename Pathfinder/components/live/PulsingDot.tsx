'use client';

// PulsingDot — small filled dot with a slow outer ring expand.
// Matches the prototype's two-layer pulse (1.2s ease-in-out, low amplitude).

import React from 'react';

import { PF_TINTS, hexAlpha } from '@/lib/agent-tints';
import { useLiveKeyframes } from '@/lib/realtime';

export interface PulsingDotProps {
  size?: number;
  color?: string;
}

export function PulsingDot({ size = 6, color }: PulsingDotProps) {
  useLiveKeyframes();
  const c = color || PF_TINTS.hi;
  return (
    <span
      style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: c,
          animation: 'pf-pulse 1200ms ease-in-out infinite',
        }}
      />
      <span
        style={{
          position: 'absolute',
          inset: -2,
          borderRadius: '50%',
          border: `1px solid ${c}`,
          opacity: 0.5,
          animation: 'pf-pulse-ring 1200ms ease-out infinite',
          // mute the ring slightly with the color's own alpha
          background: hexAlpha(c, 0),
        }}
      />
    </span>
  );
}

export default PulsingDot;
