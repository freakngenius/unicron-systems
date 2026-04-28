'use client';

// StatPopover — opens when the user clicks one of the top-bar live stats
// (NEW · 24h, TRACKED, RANKED). Lists the projects in that bucket so the
// user can jump from the count to the actual records. Clicking a row
// closes the popover and opens the project modal.

import * as React from 'react';
import type { Project } from '@/lib/types';
import { ScoreChip } from './ProjectList';

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  ruleHair: 'rgba(10,10,10,0.06)',
  sans: 'var(--font-inter), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

const HI_THRESHOLD = 80;

export type StatBucket = 'new' | 'total' | 'ranked';

const BUCKET_LABELS: Record<StatBucket, string> = {
  new: 'New · last 24h',
  total: 'All tracked projects',
  ranked: 'Ranked projects',
};

export interface StatPopoverProps {
  bucket: StatBucket;
  projects: Project[];
  /** Pixel offset from the right edge of the viewport. Aligns under the
   * relevant LiveStat slot in the TopBar. */
  rightOffset: number;
  topOffset: number;
  onClose: () => void;
  onOpenProject: (p: Project) => void;
}

export function StatPopover({
  bucket,
  projects,
  rightOffset,
  topOffset,
  onClose,
  onOpenProject,
}: StatPopoverProps) {
  const filtered = React.useMemo(() => filterByBucket(projects, bucket), [projects, bucket]);

  // ESC closes; click outside closes.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Invisible scrim catches outside clicks but doesn't visually dim. */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 49,
          background: 'transparent',
        }}
      />
      <div
        role="dialog"
        aria-label={BUCKET_LABELS[bucket]}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: topOffset,
          right: rightOffset,
          width: 360,
          maxHeight: 460,
          background: PF.bg,
          border: `1px solid ${PF.ruleSoft}`,
          borderRadius: 5,
          boxShadow: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderBottom: `1px solid ${PF.ruleSoft}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="pf-label" style={{ fontSize: 9 }}>
              {BUCKET_LABELS[bucket]}
            </span>
            <span
              className="pf-mono"
              style={{ fontSize: 11, color: PF.inkDim, letterSpacing: '0.04em' }}
            >
              {filtered.length} {filtered.length === 1 ? 'opportunity' : 'opportunities'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: PF.bgAlt,
              border: 'none',
              borderRadius: 4,
              width: 24,
              height: 24,
              cursor: 'pointer',
              color: PF.inkDim,
              font: `400 13px ${PF.sans}`,
            }}
          >
            ✕
          </button>
        </div>
        <div className="pf-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                color: PF.inkDim,
                font: `400 12px/1.5 ${PF.sans}`,
              }}
            >
              Nothing in this bucket yet.
            </div>
          ) : (
            filtered.slice(0, 30).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onOpenProject(p);
                  onClose();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: `1px solid ${PF.ruleHair}`,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = PF.bgAlt;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 12,
                    marginBottom: 4,
                  }}
                >
                  <span
                    className="pf-mono"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: PF.inkDim,
                    }}
                  >
                    {p.source} · {relativeTime(p.ingested_at)}
                  </span>
                  <ScoreChip
                    value={p.score}
                    hi={(p.score ?? 0) >= HI_THRESHOLD}
                    warm={!!p.warm_for_customer_id}
                  />
                </div>
                <div style={{ font: `500 13px/1.35 ${PF.sans}`, color: PF.ink }}>{p.title}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function filterByBucket(projects: Project[], bucket: StatBucket): Project[] {
  if (bucket === 'total') {
    return projects.slice().sort((a, b) => Date.parse(b.ingested_at) - Date.parse(a.ingested_at));
  }
  if (bucket === 'new') {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return projects
      .filter((p) => Date.parse(p.ingested_at) >= cutoff)
      .sort((a, b) => Date.parse(b.ingested_at) - Date.parse(a.ingested_at));
  }
  // ranked
  return projects
    .filter((p) => p.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
