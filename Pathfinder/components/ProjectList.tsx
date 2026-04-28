'use client';

// ProjectList — right rail listing the ranked projects. Always shows the
// full corpus (filtered by source/cross-poll upstream) so users see the
// "29 of 29" not "6 of 29 for this branch". Branch selection is now a
// camera operation; the right rail stays comprehensive.
//
// Sort modes: Score / Distance / Posted / Most Recent.
// Filters: All / Starred.
// Each row supports star + hide. Hidden rows disappear from list AND map
// (filter is applied in dashboard.tsx).

import * as React from 'react';
import type { Branch, Project } from '@/lib/types';
import { CountUpScore, useHeaderHeight, useJustRanked } from './live';
import { useStarred, useHidden, toggleStar, hideProject } from '@/lib/user-prefs';

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  ruleSoft: 'rgba(10,10,10,0.12)',
  ruleHair: 'rgba(10,10,10,0.06)',
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.14)',
  warm: '#a3e635',
  warmSoft: 'rgba(163,230,53,0.16)',
  star: '#FFB454', // amber for the filled star
  sans: 'var(--font-inter), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

const HI_THRESHOLD = 80;

type SortMode = 'score' | 'distance' | 'posted' | 'recent';
type FilterMode = 'all' | 'starred';

const SORT_LABELS: Record<SortMode, string> = {
  score: 'Score',
  distance: 'Distance',
  posted: 'Posted',
  recent: 'Most recent',
};

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
  const branchName = branch?.name ?? 'All branches';
  const [sortMode, setSortMode] = React.useState<SortMode>('score');
  const [filterMode, setFilterMode] = React.useState<FilterMode>('all');
  const starred = useStarred();
  const hidden = useHidden();

  const visibleProjects = React.useMemo(() => {
    let arr = projects.filter((p) => !hidden.has(p.id));
    if (filterMode === 'starred') arr = arr.filter((p) => starred.has(p.id));
    if (sortMode === 'score') {
      arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (sortMode === 'distance') {
      arr.sort((a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity));
    } else if (sortMode === 'posted') {
      arr.sort((a, b) => {
        const ta = a.posted_date ? Date.parse(a.posted_date) : 0;
        const tb = b.posted_date ? Date.parse(b.posted_date) : 0;
        return tb - ta;
      });
    } else {
      // most recent — by ingested_at
      arr.sort((a, b) => Date.parse(b.ingested_at) - Date.parse(a.ingested_at));
    }
    return arr;
  }, [projects, hidden, starred, filterMode, sortMode]);

  const starredCount = React.useMemo(
    () => projects.filter((p) => starred.has(p.id) && !hidden.has(p.id)).length,
    [projects, starred, hidden],
  );

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
          {title} · {visibleProjects.length}
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
          <span className="pf-label">{crossPoll ? 'Warm-intros' : `${branchName} · ranked`}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pf-mono" style={{ fontSize: 11, color: PF.inkDim }}>
              {crossPoll
                ? `${visibleProjects.length} candidates`
                : `${visibleProjects.length}${totalCount != null ? ` of ${totalCount}` : ''}`}
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
        {/* Filter row: All / Starred */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button
            type="button"
            className={`pf-pill ${filterMode === 'all' ? 'pf-pill-active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`pf-pill ${filterMode === 'starred' ? 'pf-pill-active' : ''}`}
            onClick={() => setFilterMode('starred')}
            title="Show only opportunities you starred"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <StarIcon filled={filterMode === 'starred'} size={10} />
            Starred {starredCount > 0 ? `· ${starredCount}` : ''}
          </button>
        </div>
        {/* Sort row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`pf-pill ${sortMode === m ? 'pf-pill-active' : ''}`}
              onClick={() => setSortMode(m)}
            >
              {SORT_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }} className="pf-scrollbar">
        {visibleProjects.length === 0 ? (
          <EmptyState filterMode={filterMode} hasHidden={hidden.size > 0} />
        ) : (
          visibleProjects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              onOpen={() => onOpen(p)}
              crossPoll={crossPoll}
              starred={starred.has(p.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ filterMode, hasHidden }: { filterMode: FilterMode; hasHidden: boolean }) {
  if (filterMode === 'starred') {
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
          Nothing starred yet
        </span>
        <span className="pf-body" style={{ color: PF.inkDim, fontSize: 12, lineHeight: 1.5 }}>
          Star opportunities you want to keep tabs on. Click the star icon on any project row
          and it shows up here.
        </span>
      </div>
    );
  }
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
        No projects in view
      </span>
      <span className="pf-body" style={{ color: PF.inkDim, fontSize: 12, lineHeight: 1.5 }}>
        {hasHidden
          ? "Source filter or hidden list is excluding everything. Click \u2018Unhide\u2019 in the top bar to bring hidden opportunities back."
          : 'Once the Ingestor + Ranker agents run a cycle, ranked projects appear here.'}
      </span>
    </div>
  );
}

function ProjectRow({
  project,
  onOpen,
  crossPoll,
  starred,
}: {
  project: Project;
  onOpen: () => void;
  crossPoll: boolean;
  starred: boolean;
}) {
  const justRanked = useJustRanked();
  const isJustRanked = justRanked.has(project.id);
  const hi = (project.score ?? 0) >= HI_THRESHOLD;
  const showWarm = crossPoll && !!project.warm_for_customer_id;
  const [hover, setHover] = React.useState(false);

  const dist = project.distance_miles != null ? `${project.distance_miles.toFixed(1)} mi` : '—';
  const value = formatProjectValue(project.project_value);
  const stage = project.project_stage ?? '—';
  const ago = relativeTime(project.ingested_at);

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        padding: '14px 16px',
        borderBottom: `1px solid ${PF.ruleHair}`,
        background: hover ? PF.bgAlt : 'transparent',
        cursor: 'pointer',
        transition: 'background 80ms ease-out',
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
          {project.source} · {dist} · added {ago}
        </span>
        {isJustRanked && project.score != null ? (
          <CountUpScore target={project.score} hi={hi} warm={showWarm} />
        ) : (
          <ScoreChip value={project.score} hi={hi} warm={showWarm} />
        )}
      </div>
      <div style={{ font: `500 13px/1.35 ${PF.sans}`, color: PF.ink, paddingRight: 56 }}>
        {project.title}
      </div>
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
            <span
              style={{ width: 5, height: 5, background: PF.warm, transform: 'rotate(45deg)' }}
            />
            warm
          </span>
        )}
      </div>

      {/* Action cluster — star + hide */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          gap: 4,
          opacity: hover || starred ? 1 : 0,
          transition: 'opacity 100ms ease-out',
        }}
      >
        <RowIconButton
          title={starred ? 'Unstar opportunity' : 'Star opportunity'}
          onClick={(e) => {
            e.stopPropagation();
            toggleStar(project.id);
          }}
        >
          <StarIcon filled={starred} size={14} />
        </RowIconButton>
        <RowIconButton
          title="Hide opportunity"
          onClick={(e) => {
            e.stopPropagation();
            hideProject(project.id);
          }}
        >
          <EyeOffIcon size={14} />
        </RowIconButton>
      </div>
    </div>
  );
}

function RowIconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        appearance: 'none',
        background: 'rgba(255,255,255,0.85)',
        border: `1px solid ${PF.ruleSoft}`,
        cursor: 'pointer',
        color: PF.inkDim,
        padding: 3,
        lineHeight: 0,
        borderRadius: 3,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = PF.bg;
        e.currentTarget.style.color = PF.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.85)';
        e.currentTarget.style.color = PF.inkDim;
      }}
    >
      {children}
    </button>
  );
}

export function StarIcon({ filled, size = 14 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? PF.star : 'none'}
      stroke={filled ? PF.star : 'currentColor'}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="8,1.5 10.1,5.9 15,6.5 11.5,9.9 12.4,14.6 8,12.3 3.6,14.6 4.5,9.9 1,6.5 5.9,5.9" />
    </svg>
  );
}

function EyeOffIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 2 L14 14" />
      <path d="M3 8 c1-2.5 3-4 5-4 c1 0 2 .3 3 .8" />
      <path d="M13 8 c-.5 1.2-1.3 2.3-2.3 3" />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}

export function ScoreChip({
  value,
  hi,
  warm,
}: {
  value: number | null;
  hi?: boolean;
  warm?: boolean;
}) {
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

/** Returns a short relative-time label like "5m ago" / "2d ago" / "just now". */
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
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}
