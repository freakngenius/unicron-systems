// Skills procedural-memory types — Sprint 9 Stream C (Library Skills UI).
//
// Mirrors the response shapes promised by Stream B's API surface (Addendum 5
// §4). Stream B owns the canonical type definitions in api/skills/*; until
// that stream merges, these mirror types live here. After Stream B lands,
// import these from a shared module and delete the local declarations.
//
// TODO(sprint-9-followup): Consolidate types with Stream B's
// `api/skills/types.ts` once their PR merges. Track in the Sprint 9 closeout.

export type SkillLifecycleStatus = 'proposed' | 'approved' | 'retired' | 'rejected';
export type SkillStatus = 'active' | 'scaffolded' | 'deprecated';
export type SkillAuthorKind = 'human' | 'skill_forge' | 'imported';
export type SkillExecution = 'api' | 'agentic' | 'ui_trigger' | 'scheduled';

/** Evidence pointer carried in the `evidence` jsonb column (Addendum 5 §2.1). */
export interface SkillEvidencePointer {
  ledger_id?: string;
  trajectory_id?: string;
  note?: string;
  [key: string]: unknown;
}

/** Canonical Skill row returned from the /api/skills surface. */
export interface Skill {
  id: string;
  name: string;
  description: string | null;
  domain: string | null;

  // Procedural-memory columns (Addendum 5 §2.1)
  lifecycle_status: SkillLifecycleStatus;
  version: number;
  parent_skill_id: string | null;
  author_kind: SkillAuthorKind;
  author_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  taboo_check_id: string | null;
  run_count: number;
  success_count: number;
  last_run_at: string | null;
  decay_at: string | null;
  customer_id: string | null;
  evidence: SkillEvidencePointer[];

  // Pre-existing columns retained by Addendum 5 §1
  status: SkillStatus | null;
  type: string | null;
  inputs_schema: unknown;
  outputs_schema: unknown;
  refusal_gate: boolean;
  budget_usd_per_run: number | null;
  active: boolean;
  skill_md_path: string | null;
  run_endpoint: string | null;
  execution: SkillExecution | null;
  schedule_cron: string | null;
  trigger_event: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Returned by GET /api/skills/:id — includes inline version history. */
export interface SkillWithHistory extends Skill {
  /** Ancestors ordered latest first (descending by version). May be empty. */
  history: Skill[];
}

/** Query options for GET /api/skills. */
export interface ListSkillsParams {
  lifecycle_status?: SkillLifecycleStatus | SkillLifecycleStatus[];
  status?: SkillStatus | SkillStatus[];
  /** 'system' filters to customer_id IS NULL; 'tenant' to the caller tenant. */
  scope?: 'system' | 'tenant' | 'any';
  domain?: string;
  limit?: number;
}

/** POST /api/skills/search payload (Addendum 5 §7). */
export interface SearchSkillsBody {
  query: string;
  top_k?: number;
  lifecycle_status?: SkillLifecycleStatus | SkillLifecycleStatus[];
  scope?: 'system' | 'tenant' | 'any';
}

/** Single result row for hybrid search. */
export interface SkillSearchResult {
  skill: Skill;
  /** Reciprocal-rank-fused score after FTS + vector union. */
  score: number;
  /** Reasons the row matched, e.g. "fts:zedcor", "embedding:0.81". */
  reasons?: string[];
}

export interface SearchSkillsResponse {
  query: string;
  results: SkillSearchResult[];
}

/** Helper: extracts a human label from author_kind. */
export function authorKindLabel(kind: SkillAuthorKind): string {
  switch (kind) {
    case 'human':
      return 'Human';
    case 'skill_forge':
      return 'Skill Forge';
    case 'imported':
      return 'Imported';
    default:
      return kind;
  }
}

/** Helper: short icon glyph for author_kind. Pure ASCII; no emoji. */
export function authorKindGlyph(kind: SkillAuthorKind): string {
  switch (kind) {
    case 'human':
      return 'H';
    case 'skill_forge':
      return 'F';
    case 'imported':
      return 'I';
    default:
      return '?';
  }
}
