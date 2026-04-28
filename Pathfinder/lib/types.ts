// Single source of truth for the `pathfinder.*` schema. Mirrors the migrations in supabase/migrations.
// Every stream imports from here so the Supabase row shape, the API responses, and the React props
// share one definition.

export type AgentName = 'ingestor' | 'ranker' | 'adjacent';

export type AgentRunStatus = 'running' | 'success' | 'failed';

export type ProjectSource = 'usaspending' | 'sam.gov' | 'news' | 'harris';

export interface Branch {
  id: string;
  name: string;
  code: string;
  lat: number;
  lon: number;
  coverage_radius_miles: number;
  opened_date: string | null;
  region: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  lat: number;
  lon: number;
  served_by_branch_id: string | null;
  customer_since: string | null;
  monthly_value: number | null;
  created_at: string;
}

export interface Project {
  id: string;
  source: ProjectSource | string;
  source_id: string;
  title: string;
  summary: string | null;
  lat: number | null;
  lon: number | null;
  project_value: number | null;
  project_stage: string | null;
  posted_date: string | null;
  raw_payload: Record<string, unknown> | null;
  rationale: string | null;
  rationale_streamed_at: string | null;
  score: number | null;
  nearest_branch_id: string | null;
  distance_miles: number | null;
  outreach_hook: string | null;
  warm_for_customer_id: string | null;
  ingested_at: string;
  ranked_at: string | null;
}

export interface AgentLogRow {
  id: number;
  agent_name: AgentName;
  event_type: string;
  event_data: Record<string, unknown>;
  latency_ms: number | null;
  model_used: string | null;
  ts: string;
}

export interface AgentRun {
  id: number;
  agent_name: AgentName;
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_new: number;
  status: AgentRunStatus;
  error_message: string | null;
}

export interface AdjacentTarget {
  id: number;
  company_name: string;
  geography: string | null;
  branch_count_estimate: number | null;
  shape_match_reason: string | null;
  outreach_draft: string | null;
  surfaced_at: string;
}

// Database type bag for the typed Supabase client.
export interface PathfinderDatabase {
  pathfinder: {
    Tables: {
      branches: { Row: Branch; Insert: Omit<Branch, 'created_at'> & { created_at?: string }; Update: Partial<Branch>; Relationships: [] };
      customers: { Row: Customer; Insert: Omit<Customer, 'created_at'> & { created_at?: string }; Update: Partial<Customer>; Relationships: [] };
      projects: { Row: Project; Insert: Omit<Project, 'ingested_at'> & { ingested_at?: string }; Update: Partial<Project>; Relationships: [] };
      agent_log: { Row: AgentLogRow; Insert: Omit<AgentLogRow, 'id' | 'ts'> & { id?: number; ts?: string }; Update: Partial<AgentLogRow>; Relationships: [] };
      agent_runs: { Row: AgentRun; Insert: Omit<AgentRun, 'id' | 'started_at'> & { id?: number; started_at?: string }; Update: Partial<AgentRun>; Relationships: [] };
      adjacent_targets: { Row: AdjacentTarget; Insert: Omit<AdjacentTarget, 'id' | 'surfaced_at'> & { id?: number; surfaced_at?: string }; Update: Partial<AdjacentTarget>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
