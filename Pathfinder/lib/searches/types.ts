// lib/searches/types.ts, ICP Search S3.
//
// Shared types for the ICP Saved Search HTTP contract (SPEC-ICP-Search.md).
// S1 owns the route handlers and the DB shape; S3 only imports from here.
// Kept narrow on purpose: only the fields the front-end reads. Anything
// richer S1 returns flows through as `unknown`-typed extras.

export type SearchPhaseKey =
  | 'interpret'
  | 'geo'
  | 'sources'
  | 'wire'
  | 'scrape'
  | 'score';

export type SearchPhaseStatus = 'pending' | 'running' | 'done' | 'failed';

export interface SearchPhase {
  key: SearchPhaseKey | string;
  label: string;
  status: SearchPhaseStatus;
  detail?: string | null;
}

export interface SearchProgress {
  phases: SearchPhase[];
}

export interface SearchStats {
  sources_found?: number;
  companies_ingested?: number;
  scored?: number;
  verified?: number;
}

export type SearchStatus =
  | 'draft'
  | 'planning'
  | 'running'
  | 'complete'
  | 'failed';

export interface SavedSearchSummary {
  id: string;
  name: string;
  icp_text: string;
  region: string;
  radius_mi: number;
  status: SearchStatus | string;
  created_at: string;
  updated_at?: string | null;
}

export interface SavedSearchDetail extends SavedSearchSummary {
  fit_notes?: string | null;
  architecture?: Record<string, unknown> | null;
  source_plan?: Record<string, unknown> | null;
}

export interface SearchRun {
  status: SearchStatus | string;
  phase: string | null;
  progress: SearchProgress | null;
  stats: SearchStats | null;
}

export interface SavedSearchDetailResponse {
  saved_search: SavedSearchDetail;
  latest_run: SearchRun | null;
}

export interface SavedSearchesListResponse {
  searches: SavedSearchSummary[];
}

export interface CreateSearchInput {
  name: string;
  icp_text: string;
  region: string;
  radius_mi: number;
  fit_notes?: string;
}

export interface CreateSearchResponse {
  id: string;
}

// Lead row shape is intentionally loose. S1 returns whatever the existing
// projects table holds; S3 forwards rows into the existing CompanyLeadCard
// projection (projectToCompanyLeadView) which already tolerates partials.
export interface SearchLead extends Record<string, unknown> {
  id?: string | null;
}

export interface SearchLeadsResponse {
  leads: SearchLead[];
}
