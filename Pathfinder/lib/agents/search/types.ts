// lib/agents/search/types.ts — ICP Saved Search S2 contract.
//
// SPEC: docs/SPEC-ICP-Search.md (S2 slice).
//
// These types are the seam consumed by S1 (orchestration job), S3 (search
// detail UI), and S4 (progress component). S1's job imports the runners
// from this module; S3/S4 import only the type names through the barrel.

export type PhaseKey = 'interpret' | 'geo' | 'sources' | 'wire' | 'scrape' | 'score';

export type PhaseStatus = 'pending' | 'running' | 'done' | 'failed';

export interface PhaseEntry {
  key: PhaseKey;
  label: string;
  status: PhaseStatus;
  detail?: string;
}

export interface SearchProgress {
  phases: PhaseEntry[];
}

export interface SearchStats {
  sources_found: number;
  companies_ingested: number;
  scored: number;
  verified: number;
}

export const PHASE_ORDER: PhaseKey[] = [
  'interpret',
  'geo',
  'sources',
  'wire',
  'scrape',
  'score',
];

export const PHASE_LABELS: Record<PhaseKey, string> = {
  interpret: 'Interpret ICP',
  geo: 'Resolve geography',
  sources: 'Plan sources',
  wire: 'Wire sources',
  scrape: 'Scrape signals',
  score: 'Score + verify',
};

export function initialProgress(): SearchProgress {
  return {
    phases: PHASE_ORDER.map((key) => ({
      key,
      label: PHASE_LABELS[key],
      status: 'pending' as PhaseStatus,
    })),
  };
}

export function initialStats(): SearchStats {
  return { sources_found: 0, companies_ingested: 0, scored: 0, verified: 0 };
}

// ----- Architecture (interpretIcp output) ---------------------------------

export type LeadFieldType = 'string' | 'number' | 'currency' | 'enum' | 'object' | 'date';

export interface LeadFieldDef {
  type: LeadFieldType;
  required?: boolean;
  display_label?: string;
  enum_values?: string[];
}

export interface BusinessSummary {
  lead_type: string;
  business_area: string;
  problem_solved: string;
  what_they_get: string;
}

export interface ScoringSignal {
  name: string;
  weight: number;
  hint?: string;
}

export interface SearchArchitecture {
  vertical: string;
  lead_schema: Record<string, LeadFieldDef>;
  scoring_signals: ScoringSignal[];
  naics_codes: string[];
  psc_codes: string[];
  keywords: string[];
  business_summary: BusinessSummary;
}

export interface InterpretResult {
  architecture: SearchArchitecture;
  // Bookkeeping for telemetry the job can surface in progress.detail.
  architect_session_id: string;
  cost_usd: number;
}

// ----- Geo expansion (resolveGeoRadius output) ----------------------------

export interface GeoCenter {
  lat: number;
  lon: number;
  label: string;
}

export interface CountyRef {
  state: string;
  name: string;
  fips?: string;
}

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeoExpansion {
  region: string;
  radius_mi: number;
  center: GeoCenter;
  states: string[];
  counties: CountyRef[];
  metros: string[];
  bbox: BBox;
}

// ----- Source plan (planSources output) -----------------------------------

export interface Tier1Source {
  source_id: string;
  kind: string;
  params: Record<string, unknown>;
  jurisdiction?: string;
}

export interface Tier2Source {
  source_id: string;
  template: string;
  needs: string[];
  candidate_url?: string;
}

export interface Tier3Source {
  candidate: string;
  url: string;
  discovered_by: 'perplexity';
  auto_attempt: true;
  reason?: string;
}

export interface SourcePlan {
  tier1: Tier1Source[];
  tier2: Tier2Source[];
  tier3: Tier3Source[];
  generated_at: string;
}

// ----- Saved-search row shape (the columns S2 reads/writes) ---------------
//
// S1 owns the migration; we model only what we touch. Anything else on the
// row is opaque to S2.

export interface SavedSearchRow {
  id: string;
  organization_id: string | null;
  name: string;
  icp_text: string;
  region: string;
  radius_mi: number;
  status?: string | null;
  architecture: SearchArchitecture | null;
  source_plan: SourcePlan | null;
}

// ----- Phase callback (what S1's job persists into search_runs.progress) --

export type OnPhase = (event: {
  key: PhaseKey;
  status: PhaseStatus;
  detail?: string;
}) => void | Promise<void>;
