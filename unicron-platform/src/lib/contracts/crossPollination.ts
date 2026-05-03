// Wire types for the Cross-Pollination Engine match table.
//
// Source of truth: Pathfinder/supabase/migrations/0101_zedcor_cross_pollination.sql.
// Spec: SPEC - Cross-Pollination Engine.md.
//
// As of 2026-05-02, the table lacks verify/manual columns — see
// MEMORY/operator-todos/2026-05-02-pathfinder-cross-pollination-verify-schema.md.
// The Verify field types below describe the eventual shape; current real-mode
// reads succeed but verify writes are gated to mock + agent_dispatches only.

export type MatchLayer = 'exact' | 'fuzzy' | 'parent_company';

export type MatchedField =
  | 'project_owner'
  | 'prime_contractor'
  | 'key_sub'
  | 'parent_company';

export interface CrossPollinationMatch {
  id: string;
  lead_id: string;
  customer_org_id: string;
  customer_canonical: string;
  match_layer: MatchLayer;
  match_confidence: number;
  primary_branch_id: string | null;
  primary_branch_name: string | null;
  branch_count: number;
  active_site_count: number;
  most_recent_site_date: string | null;
  national_account: boolean;
  matched_at: string;
  matched_field: MatchedField;
  matched_value_raw: string;
  // Future fields (operator-todo): verified_by_user_id, verified_at,
  // rejected_by_user_id, rejected_at, rejection_reason, manual.
  verified_by_user_id?: string | null;
  verified_at?: string | null;
  rejected_at?: string | null;
  manual?: boolean;
}

export interface ListMatchesFilter {
  /** Single lead. */
  lead_id?: string;
  /** Batch — query OR-of-IDs. */
  lead_ids?: string[];
  customer_org_id?: string;
  /** Inclusive lower bound on match_confidence. */
  min_confidence?: number;
  limit?: number;
}

/**
 * Buckets used to render the result panel:
 *   high (>= 0.9): auto-verified by default; operator can revoke
 *   ambiguous (0.7..0.9): per-match Verify / Reject required
 *   low (< 0.7): rendered for transparency but not surfaced for action
 */
export type MatchBucket = 'high' | 'ambiguous' | 'low';

export function bucketFor(confidence: number): MatchBucket {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'ambiguous';
  return 'low';
}
