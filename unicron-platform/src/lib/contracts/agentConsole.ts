// Wire types for unicron.agent_dispatches + unicron.agent_dispatch_events.
// Mirrors the schema applied at unicron-platform/supabase/migrations/0001_agent_console.sql.
//
// Per-agent input/result payload shapes are intentionally `Record<string, unknown>`
// here — Phase 1 streams provide stronger types via the registry's per-agent
// `formSchema` and `resultRenderer`. The console foundation stays
// agent-agnostic.

export type AgentDispatchStatus =
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'verified'
  | 'rejected'
  | 'failed';

export type AgentDispatchEventType =
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'partial_output'
  | 'decision'
  | 'error';

export interface AgentDispatch {
  id: string;
  agent_name: string;
  customer_org_id: string;
  dispatched_by_user_id: string | null;
  input_payload: Record<string, unknown>;
  status: AgentDispatchStatus;
  result_payload: Record<string, unknown> | null;
  rejection_reason: string | null;
  verified_by_user_id: string | null;
  verified_at: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  /**
   * pathfinder.agent_runs.id is bigint. JS number is safe here for any
   * realistic row count (Postgres bigserial → 2^53 ceiling), but call sites
   * that hand this back to Postgres should pass it as-is so the JSON ↔ bigint
   * roundtrip stays clean.
   */
  agent_run_id: number | null;
  parent_dispatch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentDispatchEvent {
  id: string;
  dispatch_id: string;
  event_type: AgentDispatchEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

export const ALL_DISPATCH_STATUSES: readonly AgentDispatchStatus[] = [
  'queued',
  'running',
  'awaiting_review',
  'verified',
  'rejected',
  'failed',
] as const;

export const ALL_EVENT_TYPES: readonly AgentDispatchEventType[] = [
  'reasoning',
  'tool_call',
  'tool_result',
  'partial_output',
  'decision',
  'error',
] as const;

export const TERMINAL_STATUSES: readonly AgentDispatchStatus[] = [
  'verified',
  'rejected',
  'failed',
] as const;

export function isTerminal(status: AgentDispatchStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
