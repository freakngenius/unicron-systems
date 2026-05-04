'use client';

// ProjectList — right rail listing the ranked projects. Always shows the
// full corpus (filtered by source/cross-poll upstream) so users see the
// "29 of 29" not "6 of 29 for this branch". Branch selection is now a
// camera operation; the right rail stays comprehensive.
//
// Sort modes: Score / Distance / Posted / Most Recent (single dropdown +
// direction toggle ↑ ASC / ↓ DESC).
// Filters:
//   - Range: WITHIN / OUTSIDE / ALL — gated against the org-level distance
//     threshold (default 250mi). TODO: switch to pathfinder.org_geo_config
//     once Stream P1 lands the table.
//   - Score floor: 0–90 in steps of 10 ("Score ≥ N").
//   - Starred: legacy quick-filter (kept; spec § 3.2 only mentioned removing
//     the Atlanta/Chicago/Phoenix/Seattle preset chip row, which already
//     wasn't in this code path).
// Filter + sort state persists in the URL query string
// (?sort=score&dir=desc&range=within&min_score=80&filter=all) so the view
// is bookmarkable and reload-stable. See `lib/list-filters.ts` for the
// shared parse / serialize helpers (with vitest coverage).
//
// Each row supports star + hide. Hidden rows disappear from list AND map
// (filter is applied in dashboard.tsx).

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Branch, Project } from '@/lib/types';
import { CountUpScore, useHeaderHeight, useJustRanked } from './live';
import { useStarred, useHidden, toggleStar, hideProject } from '@/lib/user-prefs';
import { stageLabel } from '@/lib/stages';
import { sourceLabel } from '@/lib/sources';
import { useScoringConfig } from '@/lib/scoring-config';
import { useOutreachDraftCounts } from '@/lib/outreach-drafts-client';
import { useOrgGeoConfig } from '@/lib/org-config-client';
import {
  parseListFilterState,
  serializeListFilterState,
  type ListFilterState,
  type RangeMode,
  SCORE_FLOOR_STEPS,
} from '@/lib/list-filters';
import { Tooltip } from './Tooltip';

// Fallback distance threshold used until /api/org-config resolves on mount.
// Live value comes from pathfinder.org_geo_config (Z-F finish wires this in).
const DEFAULT_MAX_SUPPORTED_DISTANCE_MILES = 250;

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

// Fallback only — the live value comes from useScoringConfig() below.
// Kept so server-side renders + tests don't blow up before the hook resolves.
const HI_THRESHOLD_FALLBACK = 80;

type SortMode = 'score' | 'distance' | 'posted' | 'recent' | 'value';
type FilterMode = 'all' | 'starred';

const SORT_LABELS: Record<SortMode, string> = {
  score: 'Score',
  distance: 'Distance',
  posted: 'Posted',
  recent: 'Most recent',
  value: 'Project Size',
};

// Glossary copy for the sort-mode pills. Plain-language one-liners; no
// model branding. Sourced from docs/specs/ranker.md scoring formula.
const SORT_TOOLTIPS: Record<SortMode, string> = {
  score: 'Composite 0–100 fit score from the Ranker — higher = closer match to a Zedcor branch and customer base.',
  distance: 'Sort by miles from the project to the nearest Zedcor branch — closest first.',
  posted: 'Sort by the date the source originally published the opportunity — newest first.',
  recent: 'Sort by when the Ranker most recently scored or rescored the opportunity — newest first.',
  value: 'Sort by stated project value (project_value) — biggest dollars first. Projects without a stated value sort to the bottom.',
};

const RANGE_LABELS: Record<RangeMode, string> = {
  within: 'Within range',
  outside: 'Outside range',
  all: 'All',
};

/** Headline label that mirrors the active range filter (spec § 3.2). */
function rangeHeadline(range: RangeMode): string {
  if (range === 'within') return 'WITHIN RANGE';
  if (range === 'outside') return 'OUTSIDE RANGE';
  return 'ALL BRANCHES';
}

/** Best-available distance for range gating. The dashboard's primary
 * `distance_miles` field is the multi-tenant nearest-branch distance.
 * `zedcor_distance_miles` (Z-C GeoMapper) is preferred when present; falls
 * back to `distance_miles`. Projects with neither are treated as "unknown
 * distance" and excluded from WITHIN/OUTSIDE narrowing (they show only in
 * `range=all`). */
function projectDistanceMiles(p: Project): number | null {
  if (typeof p.zedcor_distance_miles === 'number' && Number.isFinite(p.zedcor_distance_miles)) {
    return p.zedcor_distance_miles;
  }
  if (typeof p.distance_miles === 'number' && Number.isFinite(p.distance_miles)) {
    return p.distance_miles;
  }
  return null;
}

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filter + sort state lives in the URL query string so the view is
  // bookmarkable and reload-stable. We read from useSearchParams and write
  // back via router.replace (no history entry per chip click).
  const filterState: ListFilterState = React.useMemo(
    () => parseListFilterState(searchParams),
    [searchParams],
  );
  const { sort: sortMode, dir: sortDir, range: rangeMode, minScore, filter: filterMode } = filterState;

  const updateFilter = React.useCallback(
    (patch: Partial<ListFilterState>) => {
      const next = { ...filterState, ...patch };
      const qs = serializeListFilterState(next);
      const url = qs.length > 0 ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    },
    [filterState, pathname, router],
  );

  const starred = useStarred();
  const hidden = useHidden();
  // Hoisted to ProjectList (not per-row) so 50+ ProjectRow instances share
  // a single fetch instead of N parallel ones on mount.
  const { counts: draftCounts } = useOutreachDraftCounts();

  const { config: orgGeoConfig } = useOrgGeoConfig();
  const maxDistance =
    orgGeoConfig.max_supported_distance_miles ?? DEFAULT_MAX_SUPPORTED_DISTANCE_MILES;

  const visibleProjects = React.useMemo(() => {
    let arr = projects.filter((p) => !hidden.has(p.id));
    if (filterMode === 'starred') arr = arr.filter((p) => starred.has(p.id));

    // Range gating against the org-level distance threshold (spec § 3.2).
    // "Unknown distance" projects only show in range=all so the WITHIN /
    // OUTSIDE buckets are unambiguous.
    if (rangeMode !== 'all') {
      arr = arr.filter((p) => {
        const d = projectDistanceMiles(p);
        if (d == null) return false;
        return rangeMode === 'within' ? d <= maxDistance : d > maxDistance;
      });
    }

    if (minScore > 0) {
      arr = arr.filter((p) => (p.score ?? 0) >= minScore);
    }

    if (sortMode === 'value') {
      // Project Size — partition into "has value" / "no value" and sort
      // only the valued half by the chosen direction. The unvalued half
      // is appended afterward so projects with a null project_value
      // always land at the bottom, regardless of asc/desc. (A null value
      // means "unknown $", not "smallest $", so flipping direction
      // shouldn't promote them above the priced opportunities.)
      const withValue: Project[] = [];
      const withoutValue: Project[] = [];
      for (const p of arr) {
        if (typeof p.project_value === 'number' && Number.isFinite(p.project_value)) {
          withValue.push(p);
        } else {
          withoutValue.push(p);
        }
      }
      withValue.sort((a, b) =>
        sortDir === 'asc'
          ? (a.project_value ?? 0) - (b.project_value ?? 0)
          : (b.project_value ?? 0) - (a.project_value ?? 0),
      );
      arr = [...withValue, ...withoutValue];
    } else {
      if (sortMode === 'score') {
        arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      } else if (sortMode === 'distance') {
        arr.sort(
          (a, b) =>
            (projectDistanceMiles(a) ?? Infinity) - (projectDistanceMiles(b) ?? Infinity),
        );
      } else if (sortMode === 'posted') {
        arr.sort((a, b) => {
          const ta = a.posted_date ? Date.parse(a.posted_date) : 0;
          const tb = b.posted_date ? Date.parse(b.posted_date) : 0;
          return tb - ta;
        });
      } else {
        // Most recent — prefer ranked_at (touched whenever the Ranker scores or
        // the Refresh button bumps a project) and fall back to ingested_at when
        // no ranking has happened yet. Using ingested_at alone made the sort
        // look static because the synthetic backfill writes everything at the
        // same timestamp.
        arr.sort((a, b) => mostRecentMs(b) - mostRecentMs(a));
      }
      if (sortDir === 'asc') arr.reverse();
    }
    return arr;
  }, [projects, hidden, starred, filterMode, sortMode, sortDir, rangeMode, minScore, maxDistance]);

  const starredCount = React.useMemo(
    () => projects.filter((p) => starred.has(p.id) && !hidden.has(p.id)).length,
    [projects, starred, hidden],
  );

  const headline = crossPoll ? 'Warm-intros' : `${rangeHeadline(rangeMode)} · ${branchName.toUpperCase()}`;
  const minimizedTitle = crossPoll ? 'Warm-intros' : `${rangeHeadline(rangeMode)} · ${branchName}`;

  if (minimized) {
    const title = minimizedTitle;
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
          <span className="pf-label">{headline}</span>
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
        {/* Sort + direction row */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Tooltip text={SORT_TOOLTIPS[sortMode]} placement="bottom">
            <select
              aria-label="Sort by"
              value={sortMode}
              onChange={(e) => updateFilter({ sort: e.target.value as SortMode })}
              style={{
                appearance: 'none',
                background: PF.bg,
                color: PF.ink,
                border: `1px solid ${PF.ruleSoft}`,
                borderRadius: 3,
                padding: '4px 22px 4px 8px',
                font: `500 11px ${PF.mono}`,
                letterSpacing: '0.04em',
                cursor: 'pointer',
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' stroke='%236b7280' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
              }}
            >
              {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                <option key={m} value={m}>
                  Sort: {SORT_LABELS[m]}
                </option>
              ))}
            </select>
          </Tooltip>
          <button
            type="button"
            className="pf-pill"
            aria-label={sortDir === 'desc' ? 'Sort direction: descending' : 'Sort direction: ascending'}
            title={sortDir === 'desc' ? 'Descending — click to flip' : 'Ascending — click to flip'}
            onClick={() => updateFilter({ dir: sortDir === 'desc' ? 'asc' : 'desc' })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <span style={{ font: `600 11px ${PF.mono}` }}>
              {sortDir === 'desc' ? '↓ DESC' : '↑ ASC'}
            </span>
          </button>
          <button
            type="button"
            className={`pf-pill ${filterMode === 'starred' ? 'pf-pill-active' : ''}`}
            onClick={() => updateFilter({ filter: filterMode === 'starred' ? 'all' : 'starred' })}
            title="Show only opportunities you starred"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
          >
            <StarIcon filled={filterMode === 'starred'} size={10} />
            Starred{starredCount > 0 ? ` · ${starredCount}` : ''}
          </button>
        </div>
        {/* Range filter row */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Tooltip
            text={`Within = within ${maxDistance}mi of any branch · Outside = beyond ${maxDistance}mi · All = no distance gate.`}
            placement="bottom"
          >
            <select
              aria-label="Range filter"
              value={rangeMode}
              onChange={(e) => updateFilter({ range: e.target.value as RangeMode })}
              style={{
                appearance: 'none',
                background: PF.bg,
                color: PF.ink,
                border: `1px solid ${PF.ruleSoft}`,
                borderRadius: 3,
                padding: '4px 22px 4px 8px',
                font: `500 11px ${PF.mono}`,
                letterSpacing: '0.04em',
                cursor: 'pointer',
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' stroke='%236b7280' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
              }}
            >
              {(Object.keys(RANGE_LABELS) as RangeMode[]).map((m) => (
                <option key={m} value={m}>
                  Filter: {RANGE_LABELS[m]}
                </option>
              ))}
            </select>
          </Tooltip>
        </div>
        {/* Score floor slider */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          <span
            className="pf-mono"
            style={{
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: PF.inkDim,
              minWidth: 64,
            }}
          >
            Score ≥ {minScore}
          </span>
          <input
            aria-label="Minimum score floor"
            type="range"
            min={SCORE_FLOOR_STEPS.min}
            max={SCORE_FLOOR_STEPS.max}
            step={SCORE_FLOOR_STEPS.step}
            value={minScore}
            onChange={(e) => updateFilter({ minScore: Number(e.target.value) })}
            style={{
              flex: 1,
              accentColor: PF.ink,
              cursor: 'pointer',
            }}
          />
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }} className="pf-scrollbar">
        {visibleProjects.length === 0 ? (
          <EmptyState
            filterMode={filterMode}
            rangeMode={rangeMode}
            minScore={minScore}
            hasHidden={hidden.size > 0}
          />
        ) : (
          visibleProjects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              onOpen={() => onOpen(p)}
              crossPoll={crossPoll}
              starred={starred.has(p.id)}
              draftCount={draftCounts[p.id] ?? 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({
  filterMode,
  rangeMode,
  minScore,
  hasHidden,
}: {
  filterMode: FilterMode;
  rangeMode: RangeMode;
  minScore: number;
  hasHidden: boolean;
}) {
  // Surface the active filter combination so the operator knows what to
  // adjust (spec \u00a7 3.5).
  const summaryParts: string[] = [];
  summaryParts.push(`Range: ${RANGE_LABELS[rangeMode]}`);
  if (minScore > 0) summaryParts.push(`Score \u2265 ${minScore}`);
  if (filterMode === 'starred') summaryParts.push('Starred only');
  const summary = summaryParts.join(' \u00b7 ');

  if (filterMode === 'starred' && rangeMode === 'all' && minScore === 0) {
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

  // Active filter combo produced zero rows \u2014 guide the operator to widen
  // the filters instead of staring at an empty list.
  const isFilteredOut = rangeMode !== 'all' || minScore > 0 || filterMode === 'starred';
  if (isFilteredOut) {
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
          No leads match
        </span>
        <span className="pf-body" style={{ color: PF.inkDim, fontSize: 12, lineHeight: 1.5 }}>
          Try widening your range or lowering score floor.
        </span>
        <span
          className="pf-mono"
          style={{
            fontSize: 10,
            letterSpacing: '0.04em',
            color: PF.inkFaint,
          }}
        >
          {summary}
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
  draftCount,
}: {
  project: Project;
  onOpen: () => void;
  crossPoll: boolean;
  starred: boolean;
  draftCount: number;
}) {
  const justRanked = useJustRanked();
  const isJustRanked = justRanked.has(project.id);
  const { high_priority_threshold } = useScoringConfig();
  const hi = (project.score ?? 0) >= (high_priority_threshold || HI_THRESHOLD_FALLBACK);
  const showWarm = crossPoll && !!project.warm_for_customer_id;
  const [hover, setHover] = React.useState(false);

  const dist = project.distance_miles != null ? `${project.distance_miles.toFixed(1)} mi` : '—';
  const value = formatProjectValue(project.project_value);
  const stage = stageLabel(project.project_stage);
  const sourceDisplay = sourceLabel(project.source);
  // Show whichever timestamp signals the most recent activity. ranked_at
  // (Ranker just touched it) wins over ingested_at when it's newer.
  const recencyMs = mostRecentMs(project);
  const isRanked = !!project.ranked_at && Date.parse(project.ranked_at) === recencyMs;
  const recencyLabel = `${isRanked ? 'ranked' : 'added'} ${relativeTime(new Date(recencyMs).toISOString())}`;

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
          {sourceDisplay} · {dist} · {recencyLabel}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <VerifierBadge verified={project.verified ?? null} />
          {isJustRanked && project.score != null ? (
            <CountUpScore target={project.score} hi={hi} warm={showWarm} />
          ) : (
            <ScoreChip value={project.score} hi={hi} warm={showWarm} />
          )}
        </span>
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
        {(showWarm || draftCount > 0) && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {draftCount > 0 && (
              <span
                className="pf-mono"
                title={`${draftCount} outreach draft${draftCount === 1 ? '' : 's'} ready in modal`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  font: `600 9.5px ${PF.mono}`,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: PF.ink,
                  padding: '2px 6px',
                  borderRadius: 2,
                  background: PF.hiSoft,
                  whiteSpace: 'nowrap',
                }}
              >
                {draftCount} draft{draftCount === 1 ? '' : 's'}
              </span>
            )}
            {showWarm && (
              <span
                style={{
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
                  style={{
                    width: 5,
                    height: 5,
                    background: PF.warm,
                    transform: 'rotate(45deg)',
                  }}
                />
                warm
              </span>
            )}
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

/**
 * Small badge surfacing the Verifier's verdict.
 * - `verified === true`  → "✓ verified"   muted-green pill (warm-soft bg, lime-deep ink)
 * - `verified === false` → "⚠ unverified" amber-soft pill (matches Star icon's #FFB454 hue)
 * - `verified === null`  → "↻ pending"    inkDim text, no background
 *
 * Stays inside the existing palette — uses `PF.warmSoft` and the Star/amber
 * #FFB454 already in the file. Lime-deep `#65a30d` is the canonical
 * Tailwind lime-600 paired with our `warm` (#a3e635) lime-400 fill, so it
 * is a tonal sibling of `PF.warm` rather than a new hue.
 */
export function VerifierBadge({ verified }: { verified: boolean | null }) {
  if (verified === true) {
    return (
      <span
        title="Verifier passed all 4 checks"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 6px',
          borderRadius: 2,
          background: PF.warmSoft,
          font: `600 9.5px ${PF.mono}`,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#65a30d',
        }}
      >
        ✓ verified
      </span>
    );
  }
  if (verified === false) {
    return (
      <span
        title="Verifier flagged at least one check"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 6px',
          borderRadius: 2,
          background: 'rgba(255,180,84,0.18)',
          font: `600 9.5px ${PF.mono}`,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: PF.ink,
        }}
      >
        ⚠ unverified
      </span>
    );
  }
  return (
    <span
      title="Pending verification"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 6px',
        font: `500 9.5px ${PF.mono}`,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: PF.inkDim,
      }}
    >
      ↻ pending
    </span>
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

/** Most-recent ms — prefer ranked_at, then ingested_at. Returns 0 if neither
 * parses. Used by the "Most recent" sort. */
function mostRecentMs(p: Project): number {
  const r = p.ranked_at ? Date.parse(p.ranked_at) : NaN;
  if (Number.isFinite(r)) return r;
  const i = p.ingested_at ? Date.parse(p.ingested_at) : NaN;
  return Number.isFinite(i) ? i : 0;
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
