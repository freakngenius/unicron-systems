'use client';

// FilterBar — alternate placement of the source filter pills + cross-pollination toggle.
// In the canonical hi-fi layout these controls live inside the TopBar; FilterBar exists
// for layouts that need them as a standalone strip (e.g., narrower viewports).

import * as React from 'react';
import { SOURCE_KEYS, SOURCE_LABELS, type SourceKey } from './TopBar';

const PF = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  inkFaint: '#9ca3af',
  ruleSoft: 'rgba(10,10,10,0.12)',
  warm: '#a3e635',
} as const;

export interface FilterBarProps {
  source: SourceKey;
  setSource: (s: SourceKey) => void;
  crossPoll: boolean;
  setCrossPoll: (v: boolean) => void;
}

export function FilterBar({ source, setSource, crossPoll, setCrossPoll }: FilterBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 5,
      }}
    >
      <span className="pf-label">Sources</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {SOURCE_KEYS.map((s) => (
          <button
            key={s}
            type="button"
            className={`pf-pill ${source === s ? 'pf-pill-active' : ''}`}
            onClick={() => setSource(s)}
          >
            {SOURCE_LABELS[s]}
          </button>
        ))}
      </div>
      <div style={{ width: 1, height: 20, background: PF.ruleSoft }} />
      <button
        type="button"
        className={`pf-pill ${crossPoll ? 'pf-pill-warm' : ''}`}
        onClick={() => setCrossPoll(!crossPoll)}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: crossPoll ? PF.warm : PF.inkFaint,
            transform: 'rotate(45deg)',
            display: 'inline-block',
          }}
        />
        {crossPoll ? 'Cross-pollination · ON' : 'Cross-pollination'}
      </button>
    </div>
  );
}
