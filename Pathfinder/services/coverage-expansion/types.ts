// services/coverage-expansion/types.ts — Phase 2 Stream E, Gate E2.
// Spec: SPEC - Coverage Expansion Agent.md §3-§9.

export interface CoverageScopeConstraints {
  geography?: string[];
  source_types?: string[];
  max_sources?: number;
  estimated_qualified_lift_floor?: number;
}

export interface CoverageExpansionInput {
  vertical_id?: string;
  goal: string;
  scope_constraints?: CoverageScopeConstraints;
  budget_usd?: number;
  timeout_hours?: number;
  created_by_user_email?: string;
}

export interface CoverageCandidate {
  candidate_url: string;
  candidate_type: 'socrata' | 'rest' | 'rss' | 'json-dump' | 'tier_2' | 'tier_3' | 'unknown';
  estimated_impact: number;        // qualified leads / day
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
  candidates: CoverageCandidate[];
}

export interface CoverageGoalRow {
  id: string;
  vertical_id: string | null;
  goal_text: string;
  scope_constraints: CoverageScopeConstraints;
  budget_usd: number;
  timeout_hours: number;
  status: 'draft' | 'estimating' | 'running' | 'paused' | 'completed' | 'failed';
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

export interface CoverageRunResult {
  goal_id: string;
  status: 'completed' | 'paused' | 'failed';
  total_cost_usd: number;
  total_sources_onboarded: number;
  total_sources_assist_queued: number;
  total_sources_declined: number;
  total_estimated_lift: number;
  duration_ms: number;
  reason?: string;
}
