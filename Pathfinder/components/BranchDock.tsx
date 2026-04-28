'use client';

// BranchDock — left sidebar listing the 5 branches. Click selects. Active row inverts
// (black bg + white text). Mirrors `BranchDock` in
// `pathfinder-prototype/project/hifi-shell.jsx`. Stats per branch (count, hi-pri) come
// from a derived map computed in the parent dashboard.

import * as React from 'react';
import type { Branch } from '@/lib/types';
import { LastIngestCounter, useHeaderHeight } from './live';

const PF = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  ruleHair: 'rgba(10,10,10,0.06)',
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.14)',
  sans: 'var(--font-inter), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

export interface BranchStats {
  /** Total ranked projects in this branch's coverage. */
  count: number;
  /** Hi-priority count (score >= 80). */
  hi: number;
}

export interface BranchDockProps {
  /** Selected branch id; `null` means "See All" (zoom to full extent). */
  branches: Branch[];
  selectedId: string | null;
  setSelected: (id: string | null) => void;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  /** Optional per-branch derived stats. Keyed by branch id. */
  stats?: Record<string, BranchStats>;
}

export function BranchDock({ branches, selectedId, setSelected, minimized, setMinimized, stats }: BranchDockProps) {
  const headerH = useHeaderHeight();

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        title="Expand branches"
        style={{
          position: 'absolute',
          left: 16,
          top: headerH,
          width: 44,
          background: PF.bg,
          border: `1px solid ${PF.ruleSoft}`,
          borderRadius: 5,
          boxShadow: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
          padding: '14px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          zIndex: 4,
        }}
      >
        <span
          style={{
            font: `500 10px ${PF.mono}`,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: PF.ink,
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}
        >
          Branches · {branches.length}
        </span>
        <span className="pf-mono" style={{ fontSize: 10, color: PF.inkDim }}>
          ›
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: headerH,
        bottom: 16,
        width: 240,
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 5,
        boxShadow: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 4,
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${PF.ruleSoft}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="pf-label">Branches</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pf-mono" style={{ fontSize: 11, color: PF.inkDim }}>
            n={branches.length}
          </span>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            title="Minimize"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: PF.inkDim,
              font: `500 14px ${PF.mono}`,
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ‹
          </button>
        </span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }} className="pf-scrollbar">
        {/* "See All" — zooms the map out to the full extent and surfaces every project. */}
        <SeeAllRow
          active={selectedId === null}
          totalProjects={Object.values(stats ?? {}).reduce((s, b) => s + b.count, 0)}
          totalHi={Object.values(stats ?? {}).reduce((s, b) => s + b.hi, 0)}
          onClick={() => setSelected(null)}
        />
        {branches.map((b) => {
          const active = selectedId === b.id;
          const s = stats?.[b.id] ?? { count: 0, hi: 0 };
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected(b.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '12px 16px',
                border: 'none',
                background: active ? PF.ink : 'transparent',
                color: active ? 'white' : PF.ink,
                borderBottom: `1px solid ${PF.ruleHair}`,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <span style={{ font: `600 13px ${PF.sans}` }}>{b.name}</span>
                <span
                  className="pf-mono"
                  style={{ fontSize: 13, fontWeight: 600, color: active ? 'white' : PF.ink }}
                >
                  {s.count}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 4,
                }}
              >
                <span
                  className="pf-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: active ? 'rgba(255,255,255,0.55)' : PF.inkDim,
                  }}
                >
                  {b.id} · {b.region ?? ''}
                </span>
                {s.hi > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      font: `600 9.5px ${PF.mono}`,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: active ? PF.hi : PF.ink,
                      padding: '2px 6px',
                      borderRadius: 2,
                      background: active ? 'rgba(34,211,238,0.18)' : PF.hiSoft,
                    }}
                  >
                    {s.hi} hi-pri
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${PF.ruleSoft}` }}>
        <LastIngestCounter small />
      </div>
    </div>
  );
}

function SeeAllRow({
  active,
  totalProjects,
  totalHi,
  onClick,
}: {
  active: boolean;
  totalProjects: number;
  totalHi: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '12px 16px',
        border: 'none',
        background: active ? PF.ink : 'transparent',
        color: active ? 'white' : PF.ink,
        borderBottom: `1px solid ${PF.ruleSoft}`,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ font: `600 13px ${PF.sans}` }}>See all</span>
        <span
          className="pf-mono"
          style={{ fontSize: 13, fontWeight: 600, color: active ? 'white' : PF.ink }}
        >
          {totalProjects}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <span
          className="pf-mono"
          style={{
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: active ? 'rgba(255,255,255,0.55)' : PF.inkDim,
          }}
        >
          full extent · all branches
        </span>
        {totalHi > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              font: `600 9.5px ${PF.mono}`,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: active ? PF.hi : PF.ink,
              padding: '2px 6px',
              borderRadius: 2,
              background: active ? 'rgba(34,211,238,0.18)' : PF.hiSoft,
            }}
          >
            {totalHi} hi-pri
          </span>
        )}
      </div>
    </button>
  );
}
