// lib/sources.ts — canonical source taxonomy.
//
// Single source of truth for the values that appear in
// `pathfinder.projects.source`. The DB stores compact, lowercase codes
// (`sam.gov`, `usaspending`, `harris`, `news`); the dashboard always shows
// the full display label via `sourceLabel()`.
//
// `TopBar.tsx` has its own filter-key vocabulary (`usa`, `sam`, ...) used
// for the URL/filter pill state — that's different from the DB column
// values. Both are kept in sync by humans for now; if the filter UX grows,
// fold them together here.

export interface SourceDef {
  /** Lowercase DB value as it appears in `pathfinder.projects.source`. */
  code: string;
  /** Full-word display label shown to users. */
  label: string;
  /** One-line glossary description used by tooltips. */
  description: string;
}

export const SOURCES: SourceDef[] = [
  {
    code: 'sam.gov',
    label: 'SAM.gov',
    description: 'Federal contract opportunities posted to the System for Award Management.',
  },
  {
    code: 'usaspending',
    label: 'USAspending',
    description: 'Federal contract awards and obligations from USAspending.gov.',
  },
  {
    code: 'harris',
    label: 'Harris Co.',
    description: 'Construction permits filed with Harris County, Texas.',
  },
  {
    code: 'news',
    label: 'Google News',
    description: 'Project mentions surfaced via Google News searches for construction signals.',
  },
];

/**
 * Resolve a DB-stored source value to its full-word label. Accepts the
 * canonical codes (case-insensitive). Unknown values fall through unchanged
 * so a new source the team adds doesn't render as `—` silently.
 */
export function sourceLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const lower = value.trim().toLowerCase();
  const match = SOURCES.find((s) => s.code === lower);
  return match ? match.label : value;
}

/**
 * Comma-joined list of all canonical source labels. Used by tooltips to
 * enumerate the full vocabulary so users learn the complete set.
 */
export function sourcesEnumerated(): string {
  return SOURCES.map((s) => s.label).join(', ');
}
