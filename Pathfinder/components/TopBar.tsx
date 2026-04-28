'use client';

// TopBar — floating chrome panel at the top of the dashboard. Hosts the brand mark,
// source filter pills, cross-pollination toggle, the four LiveStat slots, and the
// pulsing LIVE dot. Mirrors `TopBar` in `pathfinder-prototype/project/hifi-shell.jsx`.

import * as React from 'react';
import { LiveStat, PulsingDot } from './live';

const PF = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  hi: '#22d3ee',
  warm: '#a3e635',
  ruleSoft: 'rgba(10,10,10,0.12)',
} as const;

export type SourceKey = 'all' | 'usa' | 'sam' | 'news' | 'harris';

export const SOURCE_LABELS: Record<SourceKey, string> = {
  all: 'All sources',
  usa: 'USAspending',
  sam: 'SAM.gov',
  news: 'Google News',
  harris: 'Harris Co.',
};

export const SOURCE_KEYS: readonly SourceKey[] = ['all', 'usa', 'sam', 'news', 'harris'] as const;

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        display: 'inline-block',
        animation: spinning ? 'pf-spin 800ms linear infinite' : 'none',
      }}
      aria-hidden="true"
    >
      <path d="M14 8a6 6 0 1 1-1.76-4.24" />
      <path d="M14 2v4h-4" />
    </svg>
  );
}

if (typeof document !== 'undefined' && !document.getElementById('pf-spin-kf')) {
  const s = document.createElement('style');
  s.id = 'pf-spin-kf';
  s.textContent = `@keyframes pf-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
}

export interface TopBarProps {
  source: SourceKey;
  setSource: (s: SourceKey) => void;
  crossPoll: boolean;
  setCrossPoll: (v: boolean) => void;
  /** Manually triggers an Ingestor → Ranker cycle via /api/refresh. */
  onRefresh: () => void;
  refreshing: boolean;
}

export function TopBar({
  source,
  setSource,
  crossPoll,
  setCrossPoll,
  onRefresh,
  refreshing,
}: TopBarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        height: 52,
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 5,
        boxShadow: '0 4px 12px rgba(10,10,10,0.08), 0 0 0 1px rgba(10,10,10,0.06)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
        zIndex: 5,
      }}
    >
      {/* Brand mark + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 22,
            height: 22,
            background: PF.ink,
            borderRadius: 3,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 4,
              border: `1.5px solid ${PF.bg}`,
              borderRadius: 1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 9,
              top: 9,
              width: 4,
              height: 4,
              background: PF.hi,
              borderRadius: 1,
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, whiteSpace: 'nowrap' }}>
          <div className="pf-h2" style={{ letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            Pathfinder: Zedcore
          </div>
          <div
            className="pf-mono"
            style={{ fontSize: 9.5, color: PF.inkDim, letterSpacing: '0.04em', lineHeight: 1 }}
          >
            Powered by Unicron
          </div>
        </div>
      </div>

      <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />
      <div className="pf-label">Sources</div>
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

      <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />
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

      <button
        type="button"
        className="pf-pill"
        onClick={onRefresh}
        disabled={refreshing}
        title="Manually run Ingestor → Ranker"
        aria-label="Refresh — run Ingestor and Ranker"
        style={{
          opacity: refreshing ? 0.55 : 1,
          cursor: refreshing ? 'progress' : 'pointer',
        }}
      >
        <RefreshIcon spinning={refreshing} />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
        <LiveStat valueKey="new" label="New · 24h" accent="hi" />
        <LiveStat valueKey="total" label="Tracked" />
        <LiveStat valueKey="ranked" label="Ranked" />
        <LiveStat valueKey="err" label="Errors" muted />
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 12,
            borderLeft: `1px solid ${PF.ruleSoft}`,
          }}
        >
          <PulsingDot color={PF.warm} />
          <span className="pf-label">Live</span>
        </span>
      </div>
    </div>
  );
}
