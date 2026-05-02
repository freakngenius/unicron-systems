// Stream C ↔ Stream E contract (Source Onboarder Agent).
//
// Reconciled 2026-05-01 against Stream E's actual shipped HTTP surface
// (Pathfinder/app/api/sources/onboard/route.ts and
//  Pathfinder/app/api/sources/sessions/[id]/route.ts in commit 50fc5ca).
//
// Stream E shipped a SINGLE-PHASE async-by-default flow, NOT the speculative
// two-phase analyze→deploy flow this file used to project. The canonical
// types are OnboardRequest / OnboardResponse / OnboardSyncResponse /
// OnboardAsyncResponse / SessionGetResponse below.
//
// The old two-phase types (AnalyzeRequest, AnalysisResponse, DeployRequest,
// DeployResponse) remain at the bottom of this file marked @deprecated so
// the existing AddSourcePanel + sourceOnboarderClient continue to compile
// while the UX redesign decision is pending. See
// MEMORY/audit-unicron-platform.md "Stream C findings — 2026-05-01" for
// the open product question (Stream C accepts single-phase + drops preview,
// OR Stream E adds /api/sources/analyze for inference-without-write to
// preserve preview UX).

import type { DataSource, AgentDef } from '../../context/SystemContext';

// ---------------------------------------------------------------------------
// Canonical Stream E shape (sync + async, both modes published by /onboard).
// ---------------------------------------------------------------------------

export type OnboardHint = 'socrata' | 'rest' | 'rss' | 'json-dump';

/**
 * Body for `POST /pathfinder/api/sources/onboard`.
 * Either `url` or `description` is required (route returns 400 otherwise).
 * Add `?sync=1` to the URL to run the agent inline; default is async dispatch.
 */
export type OnboardRequest = {
  url?: string;
  description?: string;
  hint?: OnboardHint;
  jurisdiction?: string;
  poll_frequency_seconds?: number;
  /** Name of an env var that holds an API key (NOT the key itself). */
  api_key_env?: string;
  created_by_user_email?: string;
};

export type OnboardOutcomeStatus = 'live' | 'queued' | 'human-assist' | 'declined';

export type AdapterKind = 'socrata' | 'rest' | 'rss' | 'json-dump' | 'tier_2_pending';

/** Sync response (when caller adds `?sync=1`). */
export type OnboardSyncResponse = {
  ok: boolean;
  status: OnboardOutcomeStatus;
  source_id?: string;
  adapter_kind?: AdapterKind;
  schema?: Record<string, unknown>;
  first_event_at?: string;
  ticket_id?: string;
  /** Set when status is 'declined' or 'human-assist'. */
  reason?: string;
  session_id: string;
  cost_usd: number;
  duration_ms: number;
};

/** Async response (default mode — Inngest dispatch). */
export type OnboardAsyncResponse = {
  status: 'queued';
  request_id: string;
};

export type OnboardResponse = OnboardSyncResponse | OnboardAsyncResponse;

/** 4xx body shape from the route's input-validation branches. */
export type OnboardErrorResponse = {
  error: 'invalid_json' | 'missing_input';
  detail?: string;
};

// ---------------------------------------------------------------------------
// Session polling — `GET /pathfinder/api/sources/sessions/:id`.
// Mirrors the columns the route projects from architect_sessions.
// ---------------------------------------------------------------------------

export type SessionAgentRole = 'source-onboarder' | 'coverage-expansion' | 'architect';

export type SessionStatus =
  | 'in_progress'
  | 'running'
  | 'completed'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'needs_assist';

export type SessionGetResponse = {
  id: string;
  agent_role: SessionAgentRole | null;
  goal: string | null;
  status: SessionStatus;
  reasoning_log: unknown[];
  outcome: Record<string, unknown> | null;
  total_cost_usd: number;
  total_llm_calls: number;
  total_tool_calls: number;
  started_at: string;
  completed_at: string | null;
};

// ---------------------------------------------------------------------------
// LEGACY — pre-reconciliation projected types. Kept so the existing
// AddSourcePanel + sourceOnboarderClient compile until the UX redesign
// decision lands. Do NOT use in new code.
// ---------------------------------------------------------------------------

export type SourceTabKind = 'url' | 'api' | 'feed' | 'file' | 'describe';

/** @deprecated Stream E exposes a single-phase /onboard endpoint, not analyze→deploy. Use OnboardRequest. */
export type AnalyzeRequest = {
  tab: SourceTabKind;
  input: string;
  meta?: Record<string, string>;
};

/** @deprecated No analysis-step preview on Stream E. Pending UX redesign — see MEMORY/audit-unicron-platform.md. */
export type AnalysisFieldGuess = {
  field: string;
  guess: string;
  confidence: number;
};

/** @deprecated See OnboardSyncResponse for the canonical shape. */
export type AnalysisResponse = {
  analysisId: string;
  jurisdiction: string;
  sourceType: 'permits' | 'sam_gov' | 'news' | 'entity_formation' | 'land_txn' | 'rfp';
  detectedAdapter: 'socrata' | 'rest-json' | 'rss' | 'json-dump' | 'unknown';
  estimatedDailyVolume: number;
  estimatedQualifiedPerDay: number;
  fields: AnalysisFieldGuess[];
  proposedSource: DataSource;
  proposedWatcher: AgentDef;
  confidence: number;
  costUsd?: number;
};

/** @deprecated Stream E has no /deploy endpoint; deploy is folded into the sync /onboard call. */
export type DeployRequest = {
  analysisId: string;
  overrides?: Partial<DataSource>;
};

/** @deprecated See OnboardSyncResponse — `firstEventMs` corresponds to `first_event_at` (timestamp, not duration). */
export type DeployResponse = {
  ok: true;
  source: DataSource;
  watcher: AgentDef;
  firstEventMs?: number;
};

/** Generic error shape. Kept for backwards compatibility with sourceOnboarderClient. */
export type SourceOnboarderError = {
  ok: false;
  code: string;
  message: string;
};
