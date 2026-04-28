'use client';

// ProjectList — right rail listing the ranked projects for the selected branch.
// Includes ScoreChip helper (and ProjectRow). Mirrors `ProjectList`/`ProjectRow`/`ScoreChip`
// in `pathfinder-prototype/project/hifi-shell.jsx`.

import * as React from 'react';
import type { Branch, Project } from '@/lib/types';
import { CountUpScore, useHeaderHeight, useJustRanked } from './live';

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  ruleHair: 'rgba(10,10,10,0.06)',
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.14)',
  warm: '#a3e635',
  warmSoft: 'rgba(163,230,53,0.16)',
  sans: 'var(--font-inter), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

const HI_THRESHOLD = 80;

export interface ProjectListProps {
  branch: Branch | null;
  projects: Project[];
  totalCount?: number;
  onOpen: (p: Project) => void;
  crossPoll: boolean;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
}

export function ProjectList({
  branch,
  projects,
  totalCount,
  onOpen,
  crossPoll,
  minimized,
  setMinimized,
}: ProjectListProps) {
  const headerH = useHeaderHeight();
  const branchName = branch?.name ?? 'Branch';

  if (minimized) {
    const title = crossPoll ? 'Warm-intros' : `${branchName} · Ranked`;
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        title="Expand project list"
        style={{
          position: 'absolute',
          right: 16,
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
        <span className="pf-mono" style={{ fontSize: 10, color: PF.inkDim }}>
          ‹
        </span>
        <span
          style={{
            font: `500 10px ${PF.mono}`,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: PF.ink,
            writingMode: 'vertical-rl',
          }}
        >
          {title} · {projects.length}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        top: headerH,
        bottom: 16,
        width: 380,
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 5,
        boxShadow: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 4,
      }}
    >
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${PF.ruleSoft}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="pf-label">
            {crossPoll ? 'Warm-intros' : `${branchName} · ranked`}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pf-mono" style={{ fontSize: 11, color: PF.inkDim }}>
              {crossPoll
                ? `${projects.length} candidates`
                : `${projects.length}${totalCount != null ? ` of ${totalCount}` : ''}`}
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
              ›
            </button>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button type="button" className="pf-pill pf-pill-active">
            Score
          </button>
          <button type="button" className="pf-pill">
            Distance
          </button>
          <button type="button" className="pf-pill">
            Posted
          </button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }} className="pf-scrollbar">
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          projects.map((p) => (
            <ProjectRow key={p.id} project={p} onOpen={() => onOpen(p)} crossPoll={crossPoll} />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span className="pf-label" style={{ fontSize: 9 }}>
        No projects yet
      </span>
      <span className="pf-body" style={{ color: PF.inkDim, fontSize: 12, lineHeight: 1.5 }}>
        Computer ingestor offline. Once the Pathfinder Ingestor agent runs in Perplexity Spaces,
        ranked projects appear here.
      </span>
    </div>
  );
}

function ProjectRow({
  project,
  onOpen,
  crossPoll,
}: {
  project: Project;
  onOpen: () => void;
  crossPoll: boolean;
}) {
  const justRanked = useJustRanked();
  const isJustRanked = justRanked.has(project.id);
  const hi = (project.score ?? 0) >= HI_THRESHOLD;
  const showWarm = crossPoll && !!project.warm_for_customer_id;

  const dist = project.distance_miles != null ? `${project.distance_miles.toFixed(1)} mi` : '—';
  const value = formatProjectValue(project.project_value);
  const stage = project.project_stage ?? '—';

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '14px 16px',
        border: 'none',
        borderBottom: `1px solid ${PF.ruleHair}`,
        background: 'transparent',
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
          marginBottom: 6,
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
          {project.source} · {dist}
        </span>
        {isJustRanked && project.score != null ? (
          <CountUpScore target={project.score} hi={hi} warm={showWarm} />
        ) : (
          <ScoreChip value={project.score} hi={hi} warm={showWarm} />
        )}
      </div>
      <div style={{ font: `500 13px/1.35 ${PF.sans}`, color: PF.ink }}>{project.title}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <span
          style={{
            font: `500 10px ${PF.mono}`,
            color: PF.inkDim,
            padding: '2px 6px',
            background: PF.bgAlt,
            borderRadius: 2,
          }}
        >
          {stage}
        </span>
        <span className="pf-mono" style={{ fontSize: 10, color: PF.inkDim }}>
          {value}
        </span>
        {showWarm && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              font: `600 9.5px ${PF.mono}`,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: PF.ink,
              padding: '2px 6px',
              borderRadius: 2,
              background: PF.warmSoft,
            }}
          >
            <span style={{ width: 5, height: 5, background: PF.warm, transform: 'rotate(45deg)' }} />
            warm
          </span>
        )}
      </div>
    </button>
  );
}

export function ScoreChip({ value, hi, warm }: { value: number | null; hi?: boolean; warm?: boolean }) {
  const bg = warm ? PF.warmSoft : hi ? PF.hiSoft : 'transparent';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 7px',
        borderRadius: 3,
        background: bg,
      }}
    >
      <span
        style={{
          font: `600 12px ${PF.mono}`,
          color: PF.ink,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value ?? '—'}
      </span>
    </span>
  );
}

function formatProjectValue(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
