// services/architect/types.ts — Phase 2 Stream D.
// Spec: SPEC - Architect Agent.md §3, §4, §5.
//
// Public types for the Architect runtime — input shapes, output shapes,
// session and proposal row shapes. Imported by the runtime, the API
// routes, and the Stream C operator UI (read-only consumer).

// ----- Session types ------------------------------------------------------

export type ArchitectSessionType = 'decomposition' | 'tuning' | 'discovery';
export type ArchitectSessionStatus =
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'timed_out';

export type ArchitectTrigger =
  | 'manual'
  | 'cron'
  | 'adjacency_threshold'
  | 'operator_action'
  | 'periodic';

// One turn in the agent loop's persisted reasoning log.
export interface ReasoningEntry {
  ts: string;
  role: 'user' | 'assistant' | 'tool';
  // For assistant turns: surfaced text + tool calls.
  text?: string;
  tool_calls?: { id: string; name: string; input: unknown }[];
  // For tool turns: results paired by tool_use_id.
  tool_use_id?: string;
  tool_name?: string;
  tool_result?: unknown;
  is_error?: boolean;
}

export interface ArchitectSessionRow {
  id: string;
  vertical_id: string;
  session_type: ArchitectSessionType;
  trigger: ArchitectTrigger;
  input_payload: Record<string, unknown>;
  reasoning_log: ReasoningEntry[];
  output_payload: Record<string, unknown> | null;
  status: ArchitectSessionStatus;
  failure_reason: string | null;
  duration_ms: number | null;
  cost_usd: number;
  turns: number;
  customer_org_id: string | null;
  created_at: string;
  completed_at: string | null;
}

// ----- Proposal types -----------------------------------------------------

export type ArchitectProposalType =
  | 'vertical_configuration'
  | 'source_discovery'
  | 'agent_proposal'
  | 'tuning_suggestion';

export type ArchitectProposalStatus =
  | 'pending'
  | 'approved'
  | 'dismissed'
  | 'auto_accepted'
  | 'expired';

export interface ArchitectProposalRow {
  id: string;
  session_id: string | null;
  vertical_id: string;
  type: ArchitectProposalType;
  headline: string;
  body: string | null;
  details: Record<string, unknown>;
  confidence: number;
  status: ArchitectProposalStatus;
  resolved_at: string | null;
  resolved_by_user_email: string | null;
  resolution_notes: string | null;
  source_input_summary: string | null;
  created_at: string;
}

// ----- Decomposition (§3) -------------------------------------------------

export interface DecompositionInput {
  buyer_pain_prompt: string;
  vertical_id?: string;
  customer_org_id?: string;
  existing_vertical_id?: string;
  // Caller may set constraints (e.g., 'must use HubSpot delivery'). Surfaced
  // verbatim into the Architect's user message.
  constraints?: string[];
  // Operator-supplied trigger context (defaults to 'manual').
  trigger?: ArchitectTrigger;
}

// Plain-language summary surfaced above the technical decomposition in the
// Onboarding view. Stable across architecture edits — operator can refine
// before Approve/Deploy. See SPEC - Architect Business Summary Panel.md.
export interface BusinessSummary {
  lead_type: string;
  business_area: string;
  problem_solved: string;
  what_they_get: string;
}

// What the Architect's `finalizeProposal` tool emits, validated server-side.
export interface DecompositionProposal {
  buyer: string;
  buying_signal: string;
  data_sources_proposed: {
    type: string;
    jurisdictions: string[];
    expected_daily_volume: number;
  }[];
  data_sources_rejected: { type: string; reason: string }[];
  layer_2_watchers: { source_type: string; instruction: string }[];
  layer_3_agents: { role: string; instruction: string }[];
  layer_4_agents: { role: string; instruction: string }[];
  estimates: {
    daily_qualified_volume: number;
    cost_per_lead_usd: number;
    architecture_confidence: 'low' | 'medium' | 'high';
  };
  open_questions: string[];
  business_summary: BusinessSummary;
}

export interface DecompositionResponse {
  proposal_id: string;
  session_id: string;
  architecture: DecompositionProposal;
  reasoning: string[]; // one-line summary per assistant turn
  cost_usd: number;
  duration_ms: number;
  status: ArchitectSessionStatus;
}

// ----- Tuning (§4) --------------------------------------------------------

export interface TuningInput {
  vertical_id: string;
  feedback_window_days?: number;
  trigger?: ArchitectTrigger;
}

export interface TuningProposal {
  agent_role: string;
  cluster: { reason: string; count: number; examples: string[] };
  current_instruction: string;
  proposed_instruction: string;
  shadow_test: {
    sample_size: number;
    wins: number;
    losses: number;
    side_effects: number;
    win_rate: number;
    side_effect_rate: number;
  };
  confidence: number;
  estimated_impact: string;
}

// ----- Discovery (§5) -----------------------------------------------------

export interface DiscoveryInput {
  vertical_id: string;
  trigger: ArchitectTrigger;
  context?: Record<string, unknown>;
}

export interface DiscoverySourceProposal {
  source_url: string;
  source_name: string;
  source_type: string;
  jurisdiction: string;
  tier: 'tier_1' | 'tier_2' | 'tier_3';
  estimated_daily_volume: number;
  estimated_qualified_lift_per_day: number;
  confidence: number;
  reasoning: string;
}

// ----- Cost discipline ----------------------------------------------------

export const SESSION_COST_CAP_USD: Record<ArchitectSessionType, number> = {
  decomposition: 1.5,
  tuning: 3.0,
  discovery: 2.0,
};

// Hard wall-clock timeouts per spec §9.
export const SESSION_TIMEOUT_MS: Record<ArchitectSessionType, number> = {
  decomposition: 3 * 60_000,
  tuning: 30 * 60_000,
  discovery: 15 * 60_000,
};
