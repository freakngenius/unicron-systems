'use client';

// Z-C #14 — Zedcor lead list view.
//
// Sortable table of ranked projects with their Zedcor-branch proximity.
// Columns: title, score, project_value, distance_miles, nearest branch,
// stage. Filterable by branch (single-select dropdown).

import * as React from 'react';

const BG = '#0e1116';
const BORDER = 'rgba(91, 127, 255, 0.20)';
const TEXT = '#e6e9ef';
const TEXT_MUTED = '#9aa3b2';
const ACCENT = '#5B7FFF';
const HI = '#FFB454';
const GREEN = '#3DDC97';

export interface LeadListBranch {
  id: string;
  branch_name: string;
  state: string;
}

export interface LeadListRow {
  id: string;
  title: string;
  score: number | null;
  project_value: number | null;
  project_stage: string | null;
  source: string | null;
  ingested_at: string;
  nearest_zedcor_branch_id: string | null;
  branch_name: string | null;
  branch_state: string | null;
  distance_miles: number | null;
  // Sprint Z3.5 — surfaced between Title and Stage so reps can scan
  // who to call without opening the detail page.
  gc_name?: string | null;
  gc_contact_name?: string | null;
}

type SortKey = 'title' | 'score' | 'project_value' | 'distance_miles' | 'branch' | 'stage' | 'gc_name' | 'gc_contact';
type SortDir = 'asc' | 'desc';

export interface ZedcorLeadListProps {
  initialRows: LeadListRow[];
  branches: LeadListBranch[];
  loadError: string | null;
}

export function ZedcorLeadList({ initialRows, branches, loadError }: ZedcorLeadListProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>('score');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [branchFilter, setBranchFilter] = React.useState<string>('all');

  const filtered = React.useMemo(() => {
    if (branchFilter === 'all') return initialRows;
    if (branchFilter === 'unassigned') {
      return initialRows.filter((r) => !r.nearest_zedcor_branch_id);
    }
    return initialRows.filter((r) => r.nearest_zedcor_branch_id === branchFilter);
  }, [initialRows, branchFilter]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => cmp(a, b, sortKey) * dir);
    return arr;
  }, [filtered, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(
        key === 'title' || key === 'branch' || key === 'stage' || key === 'gc_name' || key === 'gc_contact'
          ? 'asc'
          : 'desc',
      );
    }
  };

  if (loadError) {
    return (
      <div style={{ padding: 24, color: TEXT, background: BG, minHeight: '100vh', fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}>
        Failed to load: {loadError}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        color: TEXT,
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        padding: '24px 32px 64px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, letterSpacing: '0.08em', color: TEXT_MUTED }}>
            ZEDCOR · LEAD LIST
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 600 }}>
            {filtered.length} lead{filtered.length === 1 ? '' : 's'}
            <span style={{ color: TEXT_MUTED, fontSize: 14, marginLeft: 12, fontWeight: 400 }}>
              of {initialRows.length} ranked
            </span>
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ color: TEXT_MUTED, fontSize: 12, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>BRANCH</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: TEXT,
              border: `1px solid ${BORDER}`,
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 13,
              fontFamily: 'inherit',
              minWidth: 200,
            }}
          >
            <option value="all">All branches</option>
            <option value="unassigned">Unassigned</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branch_name === 'Pennsylvania' ? 'Pittsburgh' : b.branch_name}, {b.state}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <Th col="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>Title</Th>
              <Th col="gc_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>GC Name</Th>
              <Th col="gc_contact" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>GC Contact</Th>
              <Th col="score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right">Score</Th>
              <Th col="project_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right">Value</Th>
              <Th col="distance_miles" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right">Distance</Th>
              <Th col="branch" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>Nearest branch</Th>
              <Th col="stage" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>Stage</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: TEXT_MUTED }}>
                  No leads match the current filter.
                </td>
              </tr>
            )}
            {sorted.map((r, idx) => (
              <tr
                key={r.id}
                style={{
                  borderTop: `1px solid ${BORDER}`,
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                }}
              >
                <td style={{ padding: '10px 12px' }}>
                  <a
                    href={`/pathfinder/leads/${r.id}`}
                    style={{ color: TEXT, textDecoration: 'none' }}
                  >
                    <span style={{ display: 'inline-block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                      {r.title}
                    </span>
                  </a>
                </td>
                <td style={{ padding: '10px 12px', color: r.gc_name ? TEXT : TEXT_MUTED, fontSize: 13 }}>
                  <span style={{ display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                    {r.gc_name ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: r.gc_contact_name ? TEXT : TEXT_MUTED, fontSize: 13 }}>
                  <span style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                    {r.gc_contact_name ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                  <ScorePill score={r.score} />
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-jetbrains-mono), monospace', color: r.project_value ? TEXT : TEXT_MUTED }}>
                  {fmtUsd(r.project_value)}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-jetbrains-mono), monospace', color: r.distance_miles == null ? TEXT_MUTED : TEXT }}>
                  {r.distance_miles == null ? '—' : `${r.distance_miles.toFixed(0)}mi`}
                </td>
                <td style={{ padding: '10px 12px', color: r.branch_name ? TEXT : TEXT_MUTED }}>
                  {r.branch_name
                    ? `${r.branch_name === 'Pennsylvania' ? 'Pittsburgh' : r.branch_name}, ${r.branch_state ?? ''}`
                    : '— unassigned'}
                </td>
                <td style={{ padding: '10px 12px', color: TEXT_MUTED, fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12 }}>
                  {r.project_stage ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function Th({
  children,
  col,
  sortKey,
  sortDir,
  onSort,
  align,
}: {
  children: React.ReactNode;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        padding: '10px 12px',
        textAlign: align ?? 'left',
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: '0.08em',
        color: active ? ACCENT : TEXT_MUTED,
        textTransform: 'uppercase',
        cursor: 'pointer',
        userSelect: 'none',
        fontFamily: 'var(--font-jetbrains-mono), monospace',
      }}
    >
      {children}
      {active && <span style={{ marginLeft: 4, color: ACCENT }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score == null) {
    return <span style={{ color: TEXT_MUTED }}>—</span>;
  }
  const color = score >= 80 ? HI : score >= 60 ? GREEN : TEXT_MUTED;
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 38,
        padding: '2px 8px',
        borderRadius: 3,
        background: `${color}22`,
        color,
        fontWeight: 700,
      }}
    >
      {score}
    </span>
  );
}

function fmtUsd(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function cmp(a: LeadListRow, b: LeadListRow, key: SortKey): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  if (av == null && bv == null) return 0;
  if (av == null) return 1; // nulls last regardless of direction; sortDir flips final sign
  if (bv == null) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv));
}

function sortValue(r: LeadListRow, key: SortKey): string | number | null {
  switch (key) {
    case 'title':
      return r.title.toLowerCase();
    case 'score':
      return r.score;
    case 'project_value':
      return r.project_value;
    case 'distance_miles':
      return r.distance_miles;
    case 'branch':
      return r.branch_name?.toLowerCase() ?? null;
    case 'stage':
      return r.project_stage?.toLowerCase() ?? null;
    case 'gc_name':
      return r.gc_name?.toLowerCase() ?? null;
    case 'gc_contact':
      return r.gc_contact_name?.toLowerCase() ?? null;
  }
}
