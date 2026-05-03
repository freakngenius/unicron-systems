// Wire types for the Stream E Coverage Expansion contract.
//
// Source of truth: Pathfinder/services/coverage-expansion/types.ts +
// Pathfinder/supabase/migrations/0081_coverage_expansion.sql.
// HTTP route handlers per the M1 prompt §"Endpoints to wire" — but see
// MEMORY/operator-todos/2026-05-02-stream-e-coverage-http-routes.md:
// the routes themselves are not yet shipped on Pathfinder, so M1 ships
// mock-mode-only and scaffolds these wire types for the eventual cutover.

export type CoverageGoalStatus =
  | 'draft'
  | 'estimating'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export type CoverageCandidateType =
  | 'socrata'
  | 'rest'
  | 'rss'
  | 'json-dump'
  | 'tier_2'
  | 'tier_3'
  | 'unknown';

export type CoverageCandidateStatus =
  | 'pending'
  | 'dispatched'
  | 'onboarded'
  | 'assist_queued'
  | 'declined'
  | 'failed';

export interface CoverageScopeConstraints {
  geography?: string[];
  source_types?: string[];
  max_sources?: number;
  estimated_qualified_lift_floor?: number;
  /** Lookback window in days. UI-supplied; the backend treats it as advisory. */
  lookback_days?: number;
  /** Free-form keywords used to bias discovery. */
  signal_keywords?: string[];
  /** Target lead lift the operator is asking for. */
  target_lead_count?: number;
}

export interface CoverageEstimateCandidate {
  candidate_url: string;
  candidate_type: CoverageCandidateType;
  estimated_impact: number;
  estimated_tier: 1 | 2 | 3;
  jurisdiction?: string;
  notes?: string;
}

export interface CoverageEstimate {
  discovered_candidates: number;
  estimated_auto_onboardable: number;
  estimated_human_assist: number;
  estimated_declined: number;
  estimated_daily_lift: number;
  estimated_total_cost_usd: number;
  estimated_duration_hours: { low: number; high: number };
  candidates: CoverageEstimateCandidate[];
}

export interface CoverageGoal {
  id: string;
  vertical_id: string | null;
  goal_text: string;
  scope_constraints: CoverageScopeConstraints;
  budget_usd: number;
  timeout_hours: number;
  status: CoverageGoalStatus;
  estimate: CoverageEstimate | null;
  total_cost_usd: number;
  total_sources_onboarded: number;
  total_sources_assist_queued: number;
  total_sources_declined: number;
  total_estimated_lift: number;
  agent_session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_email: string | null;
}

export interface CoverageGoalCandidate {
  id: string;
  goal_id: string;
  candidate_url: string;
  candidate_type: CoverageCandidateType | null;
  estimated_impact: number | null;
  estimated_tier: 1 | 2 | 3 | null;
  status: CoverageCandidateStatus;
  source_onboarder_session_id: string | null;
  data_source_id: string | null;
  result_payload: Record<string, unknown> | null;
  dispatched_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CoverageGoalDetail {
  goal: CoverageGoal;
  candidates: CoverageGoalCandidate[];
}

export interface CreateCoverageGoalInput {
  vertical_id?: string | null;
  goal_text: string;
  scope_constraints?: CoverageScopeConstraints;
  budget_usd?: number;
  timeout_hours?: number;
  created_by_user_email?: string;
}

export interface CreateCoverageGoalResponse {
  goal_id: string;
  status: CoverageGoalStatus;
}

export interface RunCoverageGoalResponse {
  ok: boolean;
  run_event_id: string;
}

export interface ListCoverageGoalsFilter {
  vertical_id?: string;
  status?: CoverageGoalStatus;
  limit?: number;
}

export const ALL_COVERAGE_GOAL_STATUSES: readonly CoverageGoalStatus[] = [
  'draft',
  'estimating',
  'running',
  'paused',
  'completed',
  'failed',
] as const;

export const ALL_COVERAGE_CANDIDATE_STATUSES: readonly CoverageCandidateStatus[] = [
  'pending',
  'dispatched',
  'onboarded',
  'assist_queued',
  'declined',
  'failed',
] as const;
