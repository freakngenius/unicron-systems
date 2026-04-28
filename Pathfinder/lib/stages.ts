// lib/stages.ts — canonical stage taxonomy.
//
// Single source of truth for the values that appear in
// `pathfinder.projects.project_stage`. The DB stores compact codes (legacy
// from the synthetic backfill — `RFP`, `PLN`, `PRE`, `NWS`, `awarded`).
// The dashboard never shows codes — every render goes through `stageLabel()`
// so users see the full word.
//
// When the canonical set changes, update STAGES; the UI labels and the
// stage tooltip both follow.

export type StageCode = 'NWS' | 'PLN' | 'PRE' | 'RFP' | 'AWARDED';

export interface StageDef {
  /** Canonical short code as it appears in the DB column. */
  code: StageCode;
  /** Full-word label shown to users. No abbreviations. */
  label: string;
}

export const STAGES: StageDef[] = [
  { code: 'NWS',     label: 'News mention' },
  { code: 'PLN',     label: 'Planning' },
  { code: 'PRE',     label: 'Pre-construction' },
  { code: 'RFP',     label: 'RFP open' },
  { code: 'AWARDED', label: 'Contract awarded' },
];

/**
 * Resolve a DB-stored stage value to its full-word label. Accepts the
 * canonical codes (case-insensitive) plus the lowercase legacy "awarded"
 * value already in production data. Anything we can't resolve falls
 * through unchanged so a new value the team adds doesn't render as `—`
 * silently — it shows the raw string until STAGES is updated.
 */
export function stageLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const upper = value.trim().toUpperCase();
  const match = STAGES.find((s) => s.code === upper);
  return match ? match.label : value;
}

/**
 * Comma-joined list of all canonical stage labels. Used by the project-
 * detail tooltip to enumerate the full vocabulary so users learn the
 * complete set, not just the value on the project they're looking at.
 */
export function stagesEnumerated(): string {
  return STAGES.map((s) => s.label).join(', ');
}
