'use client';

// ProjectModal — centered overlay showing full project context.
// Mirrors `ProjectModal` in `pathfinder-prototype/project/hifi-shell.jsx`.
// Streams the rationale char-by-char on first open via Stream 4's <Typewriter />.

import * as React from 'react';
import type { Branch, Project } from '@/lib/types';
import { ScoreChip, StarIcon } from './ProjectList';
import { isFirstOpen, markSeen, Typewriter, useRailHeight } from './live';
import { useStarred, toggleStar } from '@/lib/user-prefs';

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkSub: '#3a3f46',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.14)',
  sans: 'var(--font-inter), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

const HI_THRESHOLD = 80;

export interface ProjectModalProps {
  project: Project;
  branch: Branch | null;
  onClose: () => void;
}

export function ProjectModal({ project, branch, onClose }: ProjectModalProps) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const railH = useRailHeight();
  const hi = (project.score ?? 0) >= HI_THRESHOLD;
  const starredSet = useStarred();
  const isStarred = starredSet.has(project.id);

  const rationale =
    project.rationale ??
    'Rationale pending. Once Pathfinder Ranker scores this project, the Claude-generated reasoning paragraph will appear here.';
  const hook = project.outreach_hook ?? 'Outreach hook will populate after the Ranker runs.';
  const dist = project.distance_miles != null ? `${project.distance_miles.toFixed(1)} mi` : '—';
  const value = formatValue(project.project_value);
  const stage = project.project_stage ?? '—';
  const sourceUrl = sourceLinkFor(project);
  const firstOpen = isFirstOpen(project.id);

  const onCopyDraft = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(`${project.title}\n\n${rationale}\n\n${hook}`);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: railH,
          background: 'rgba(10,10,10,0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, calc(-50% - ${railH / 2}px))`,
          width: 720,
          maxHeight: `calc(100vh - 80px - ${railH}px)`,
          background: PF.bg,
          border: `1px solid ${PF.ink}`,
          borderRadius: 8,
          boxShadow: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 51,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${PF.ruleSoft}` }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScoreChip value={project.score} hi={hi} />
                {hi && <span className="pf-label" style={{ color: PF.hi }}>● High-priority</span>}
                <span className="pf-label">·</span>
                <span className="pf-label">
                  {branch?.id ?? project.nearest_branch_id ?? 'Unassigned'} · {dist}
                </span>
              </div>
              <div className="pf-h1" style={{ fontSize: 22, marginTop: 8, lineHeight: 1.2 }}>
                {project.title}
              </div>
              <div
                className="pf-mono"
                style={{
                  fontSize: 10.5,
                  color: PF.inkDim,
                  marginTop: 6,
                  letterSpacing: '0.04em',
                }}
              >
                {project.source_id} · {project.source} · posted {project.posted_date ?? '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => toggleStar(project.id)}
                title={isStarred ? 'Unstar opportunity' : 'Star this opportunity to track it'}
                aria-label={isStarred ? 'Unstar' : 'Star'}
                style={{
                  background: isStarred ? 'rgba(255,180,84,0.16)' : PF.bgAlt,
                  border: isStarred ? '1px solid #FFB454' : '1px solid transparent',
                  borderRadius: 4,
                  height: 28,
                  padding: '0 10px',
                  cursor: 'pointer',
                  color: isStarred ? '#0a0a0a' : PF.inkDim,
                  font: `500 12px ${PF.sans}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <StarIcon filled={isStarred} size={13} />
                {isStarred ? 'Starred' : 'Star'}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: PF.bgAlt,
                  border: 'none',
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: 'pointer',
                  color: PF.inkDim,
                  font: `400 14px ${PF.sans}`,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            borderBottom: `1px solid ${PF.ruleSoft}`,
            background: PF.bgAlt,
          }}
        >
          {[
            { label: 'Value', value, accent: null as string | null },
            { label: 'Stage', value: stage, accent: null },
            { label: 'Distance', value: dist, accent: null },
            { label: 'Posted', value: project.posted_date ?? '—', accent: null },
          ].map((cell, i) => (
            <div
              key={cell.label}
              style={{
                padding: '14px 20px',
                borderRight: i < 3 ? `1px solid ${PF.ruleSoft}` : 'none',
              }}
            >
              <span className="pf-label" style={{ fontSize: 9 }}>
                {cell.label}
              </span>
              <div
                className="pf-num"
                style={{ fontSize: 16, marginTop: 4, color: cell.accent || PF.ink }}
              >
                {cell.value}
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div
          style={{
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            overflowY: 'auto',
          }}
          className="pf-scrollbar"
        >
          <Section
            title="Rationale"
            sub={project.rationale_streamed_at ? 'cached' : 'model: claude-sonnet'}
            accent="hi"
          >
            <p className="pf-body" style={{ margin: 0, color: PF.ink }}>
              {firstOpen ? (
                <Typewriter
                  text={rationale}
                  charsPerSec={55}
                  onDone={() => markSeen(project.id)}
                />
              ) : (
                rationale
              )}
            </p>
          </Section>

          <Section title="Recommended outreach" sub="generated · approve before sending">
            <p className="pf-body" style={{ margin: 0, color: PF.ink }}>
              {hook}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="pf-btn" onClick={onCopyDraft}>
                Copy as draft
              </button>
              <button
                type="button"
                className="pf-btn-ghost"
                onClick={onClose}
                title="Dismiss this opportunity for now"
              >
                Mark not relevant
              </button>
            </div>
          </Section>

          <Section title="Source record" sub={project.source}>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  font: `500 12px ${PF.mono}`,
                  color: PF.ink,
                  textDecoration: 'none',
                  padding: '6px 10px',
                  background: PF.bgAlt,
                  borderRadius: 3,
                }}
              >
                ↗ {sourceUrl.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              <span className="pf-mono" style={{ fontSize: 11, color: PF.inkDim }}>
                source link unavailable
              </span>
            )}
          </Section>

          <details style={{ paddingTop: 8, borderTop: `1px solid ${PF.ruleSoft}` }}>
            <summary
              style={{
                cursor: 'pointer',
                font: `500 11px ${PF.mono}`,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: PF.inkDim,
                listStyle: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ display: 'inline-block', width: 10 }}>▾</span>
              Raw payload (jsonb)
            </summary>
            <pre
              style={{
                margin: '10px 0 0',
                padding: 12,
                background: PF.bgAlt,
                borderRadius: 4,
                font: `400 10.5px/1.55 ${PF.mono}`,
                color: PF.inkSub,
                overflow: 'auto',
                maxHeight: 200,
              }}
              className="pf-scrollbar"
            >
              {JSON.stringify(project.raw_payload ?? {}, null, 2)}
            </pre>
          </details>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${PF.ruleSoft}`,
            background: PF.bgAlt,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span className="pf-label" style={{ fontSize: 9 }}>
            ESC to close
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="pf-btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  sub,
  accent,
  children,
}: {
  title: string;
  sub?: string;
  accent?: 'hi';
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {accent === 'hi' && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PF.hi }} />
          )}
          <span className="pf-label" style={{ color: PF.ink, fontSize: 10 }}>
            {title}
          </span>
        </span>
        {sub && <span className="pf-label" style={{ fontSize: 9 }}>{sub}</span>}
      </div>
      <div
        style={{
          padding: 14,
          background: accent === 'hi' ? PF.hiSoft : PF.bgAlt,
          borderRadius: 5,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function formatValue(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function sourceLinkFor(p: Project): string | null {
  // Best-effort: use raw_payload.url if present; otherwise return null.
  const url = p.raw_payload?.['url'] ?? p.raw_payload?.['source_url'] ?? p.raw_payload?.['link'];
  if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  return null;
}
