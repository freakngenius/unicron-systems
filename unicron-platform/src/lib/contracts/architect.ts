// Stream C ↔ Stream D contract (Architect Agent).
//
// Stream D shipped on 2026-05-01 (PR #37, squash-merge `68f7bd7` on main).
// Canonical contract docs: `Pathfinder/services/architect/README.md`.
// Canonical types: `Pathfinder/services/architect/types.ts`.
//
// This file mirrors Stream D's wire format (snake_case, server-side enums)
// as the **authoritative** types. Stream C's existing UI components were
// written before D published, so they reference the **legacy** types kept
// at the bottom of this file under `// ---- Legacy projection ----`.
//
// Migration plan:
//   1. ✓ This PR: mirror Stream D verbatim + retain legacy aliases so the
//      Vite build keeps compiling against the legacy shapes.
//   2. Follow-up: ArchitectThinking.tsx + ArchitectInbox.tsx + ProposalCard.tsx
//      + architectClient.ts each migrate from `Proposal` → `ArchitectProposalRow`
//      and from `DecompositionResponse` → `DecompositionApiResponse`. Each
//      component owns its own adapter (e.g., `archProposalToUiCard` mapping
//      `type` → `category`, `created_at` → `time`).
//   3. Delete the legacy aliases.
//
// UX gaps where C's projection assumes a flow D doesn't expose are
// captured in `MEMORY/audit-unicron-platform.md` under
// "Stream C findings — 2026-05-01". Notable gaps:
//   - No `lines` type-on stream — D returns `reasoning: string[]` (one
//     summary line per assistant turn) and finalizes once. The
//     ArchitectThinking type-on animation must drive itself off the
//     finished `reasoning[]` array, not a server-side stream.
//   - No `apply` patches on proposals — D's approve flow doesn't exist
//     yet as an HTTP endpoint; Stream C must write to
//     `pathfinder.architect_proposals.status` via the supabase client
//     directly until D ships an approve endpoint.
//   - No `recommendedConfig: SystemConfig` — D returns the structured
//     `architecture` shape (the spec §3 vertical_configuration). Stream C
//     needs an adapter from `architecture` to its `SystemConfig` type.

import type { SystemConfig, AgentDef, DataSource } from '../../context/SystemContext';

// ============================================================================
// CANONICAL — Stream D wire types (mirror of Pathfinder/services/architect)
// ============================================================================

// ---- Session / proposal status enums ---------------------------------------
// From `Pathfinder/services/architect/types.ts`.

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

// ---- Decomposition request/response (POST /api/architect/decompose) --------

export type DecompositionApiRequest = {
  buyer_pain_prompt: string;            // min 10 chars, max 4000
  vertical_id?: string;                 // default 'pathfinder-default'
  customer_org_id?: string;
  existing_vertical_id?: string;
  constraints?: string[];               // capped at 16 items by route handler
  trigger?: ArchitectTrigger;           // default 'manual'
};

// The architecture proposal Stream D returns inside DecompositionApiResponse.
// Structurally matches `SPEC - Architect Agent.md` §3 output JSON.
export type DecompositionArchitecture = {
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
};

export type DecompositionApiResponse = {
  proposal_id: string;                  // architect_proposals.id; pass to inbox
  session_id: string;                   // architect_sessions.id
  architecture: DecompositionArchitecture;
  reasoning: string[];                  // one-line summary per assistant turn
  cost_usd: number;                     // wall-clock; respects $1.50 cap
  duration_ms: number;
  status: ArchitectSessionStatus;
};

// ---- Tuning request/response (POST /api/architect/tune) --------------------

export type TuningApiRequest = {
  vertical_id?: string;
  feedback_window_days?: number;        // default 7, max 90
};

export type TuningProposalDetails = {
  agent_role?: string;
  cluster_key: string;
  cluster_count: number;
  current_instruction: string;
  proposed_instruction: string;
  shadow_test: {
    sample_size: number;
    wins: number;
    losses: number;
    side_effects: number;
    win_rate: number;
    side_effect_rate: number;
    method: 'model_introspective_estimate'; // see decisions.md drift note
  };
  confidence: number;
  estimated_impact: string;
};

export type TuningApiResponse = {
  session_id: string;
  proposals: ArchitectProposalRow[];    // each with type='tuning_suggestion'
  rejected: { cluster_key: string; reason: string }[];
  summary: string;
  cost_usd: number;
  duration_ms: number;
  status: ArchitectSessionStatus;
};

// ---- Discovery request/response (POST /api/architect/discover) -------------

export type DiscoveryApiRequest = {
  vertical_id?: string;
  trigger?: ArchitectTrigger;            // 'manual' | 'adjacency_threshold' | 'periodic'
  context?: Record<string, unknown>;
};

export type DiscoveryProposalDetails = {
  candidate_jurisdiction: string;
  source_type: string;
  source_url: string;                    // real http(s) URL (gated server-side)
  source_name: string;
  tier: 'tier_1' | 'tier_2' | 'tier_3';
  reference_count?: number;
  reference_rate: number;                // ≥ 0.15 per spec §5
  lift_per_day: number;                  // ≥ 2 per spec §5
  confidence: number;
  reasoning: string;
};

export type DiscoveryApiResponse = {
  session_id: string;
  proposals: ArchitectProposalRow[];     // each with type='source_discovery'
  rejected: { candidate: string; reason: string }[];
  summary: string;
  cost_usd: number;
  duration_ms: number;
  status: ArchitectSessionStatus;
};

// ---- Proposal row (read from pathfinder.architect_proposals) ---------------
// Stream D doesn't (yet) ship an HTTP listProposals endpoint — Stream C reads
// this directly from supabase. SQL contract:
//   select * from pathfinder.architect_proposals
//    where status='pending' and vertical_id=$1
//    order by created_at desc;
//
// Filter pills (Sources / Agents / Tuning) map to:
//   Sources: type='source_discovery'
//   Agents:  type in ('agent_proposal','vertical_configuration')
//   Tuning:  type='tuning_suggestion'

export type ArchitectProposalRow = {
  id: string;                            // uuid
  session_id: string | null;             // uuid FK → architect_sessions
  vertical_id: string;
  type: ArchitectProposalType;
  headline: string;
  body: string | null;
  details: Record<string, unknown>;      // jsonb; shape varies by type
                                         // (DecompositionArchitecture |
                                         //  TuningProposalDetails |
                                         //  DiscoveryProposalDetails)
  confidence: number;                    // 0..1
  status: ArchitectProposalStatus;
  resolved_at: string | null;            // ISO timestamp
  resolved_by_user_email: string | null;
  resolution_notes: string | null;
  source_input_summary: string | null;   // decomposition: echo of buyer_pain
  created_at: string;                    // ISO timestamp
};

// ---- Approve / dismiss -----------------------------------------------------
// **No HTTP endpoint exists yet** for approve / dismiss. Until Stream D ships
// one (or D's `system.addAgent` / `system.addDataSource` Source-Onboarder
// dispatch lands), Stream C should:
//   - Approve: update `architect_proposals.status='approved'` + write
//     `resolved_at`/`resolved_by_user_email` via the supabase client; then
//     dispatch any side-effects (Source Onboarder, agent installs) directly.
//   - Dismiss: update `architect_proposals.status='dismissed'` + write
//     `resolved_at`/`resolved_by_user_email`/`resolution_notes`.
//
// When the canonical endpoints land, swap Stream C's flows over.

export type ApproveProposalSqlPatch = {
  status: 'approved';
  resolved_at: string;
  resolved_by_user_email: string;
};

export type DismissProposalSqlPatch = {
  status: 'dismissed';
  resolved_at: string;
  resolved_by_user_email: string;
  resolution_notes?: string;
};

// ---- Errors ----------------------------------------------------------------

export type ArchitectApiError = {
  error: string;                         // Stream D returns plain { error }
};

// ============================================================================
// LEGACY — pre-2026-05-01 projected types still consumed by the UI
// ============================================================================
// Kept so the existing UI (architectClient.ts, ArchitectInbox.tsx,
// ProposalCard.tsx, ArchitectThinking.tsx) continues to compile while the
// follow-up migration PR adapts each component to the canonical types.
// New code should not import from this section.

/** @deprecated use DecompositionApiRequest. Maps `buyerPain` → `buyer_pain_prompt`. */
export type DecompositionRequest = {
  /** Buyer-pain free-text from the operator (Onboarding step 1). */
  buyerPain: string;
};

/** @deprecated UI-only line shape; Stream D ships `reasoning: string[]` instead. */
export type DecompositionLine = {
  index: number;
  text: string;
  kind?: 'header' | 'buyer' | 'signal' | 'data' | 'arch' | 'cost' | 'confidence';
};

/** @deprecated use DecompositionApiResponse + an in-app adapter. */
export type DecompositionResponse = {
  sessionId: string;
  lines: DecompositionLine[];
  recommendedConfig: SystemConfig;
  confidence: number;
  costUsd?: number;
  /**
   * Structured architecture echoed from the canonical API (or synthesized in
   * mock mode). Used by ArchitectThinking's in-place Edit Architecture flow.
   */
  architecture: DecompositionArchitecture;
};

/** @deprecated mapped from ArchitectProposalRow.type via the filter-pill rule. */
export type ProposalCategory = 'sources' | 'agents' | 'tuning';

export type ProposalDetail = {
  k: string;
  v: string;
};

/** @deprecated use ArchitectProposalRow + per-card adapter. */
export type Proposal = {
  id: string;
  category: ProposalCategory;
  /** Human-readable proposal type label (e.g. "SOURCE DISCOVERY"). */
  type: string;
  /** Relative time string ("8m ago"). Server-side rendered. */
  time: string;
  headline: string;
  body: string;
  details: ProposalDetail[];
  /**
   * Apply payload — a structured patch the client can replay against
   * SystemContext if the operator approves before the server roundtrip.
   * **Stream D doesn't ship `apply` patches.** Approval in production
   * writes to `architect_proposals.status` directly. The Stream C UI may
   * keep optimistic mock-mode `apply` payloads as an interim until the
   * supabase write path is wired.
   */
  apply?:
    | { kind: 'add-source'; source: DataSource; watcher?: AgentDef }
    | { kind: 'add-agent'; agent: AgentDef }
    | { kind: 'update-agent'; agentId: string; patch: Partial<AgentDef> };
};

/** @deprecated read from supabase: select * from pathfinder.architect_proposals. */
export type ListProposalsResponse = {
  proposals: Proposal[];
};

/** @deprecated no HTTP approve endpoint on Stream D — write status='approved' via supabase. */
export type ApproveProposalResponse = {
  ok: true;
  systemConfig: SystemConfig;
};

/** @deprecated no HTTP dismiss endpoint on Stream D — write status='dismissed' via supabase. */
export type DismissProposalResponse = {
  ok: true;
};

/** @deprecated use ArchitectApiError; Stream D returns plain { error }. */
export type ArchitectError = {
  ok: false;
  code: string;
  message: string;
};
