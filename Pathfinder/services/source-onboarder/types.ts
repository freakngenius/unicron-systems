// services/source-onboarder/types.ts — Source Onboarder agent contract.
//
// Spec: SPEC - Source Onboarder Agent.md.
//
// Implementation note (drift from spec §2): the spec calls for a Claude
// Agent SDK runtime session. Pathfinder does not have @anthropic-ai/claude-
// agent-sdk as a dependency, and adding it during Phase 2 is a real cost we
// have not budgeted. STREAM-README explicitly directs us to use `run` /
// `runStream` from lib/llm/, not the bare SDK. We therefore implement the
// agent as a deterministic state machine that drives the §6 decision tree
// with explicit gateway calls at each LLM-required step. The `tools` are
// plain TypeScript functions; the orchestrator (agent.ts) sequences them.
// Drift documented in MEMORY/decisions.md.

import type { AdapterKind, AdapterSpec } from '../../lib/adapters/types';

export type SourceOnboarderInputKind = 'url' | 'docs_link' | 'rss' | 'file' | 'description';

export interface SourceOnboarderInput {
  kind: SourceOnboarderInputKind;
  url?: string;
  description?: string;
  hint?: AdapterKind;
  jurisdiction?: string;
  poll_frequency_seconds?: number;
  api_key_env?: string;
  created_by_user_email?: string;
}

export type SourceOnboarderOutcome = 'live' | 'queued' | 'human-assist' | 'declined';

export interface SourceOnboarderResult {
  outcome: SourceOnboarderOutcome;
  source_id?: string;
  adapter_id?: string;
  adapter_kind?: AdapterKind;
  schema?: Record<string, unknown>;
  first_event_at?: string;
  ticket_id?: string;
  reason?: string;            // when declined or human-assist
  session_id: string;
  cost_usd: number;
  duration_ms: number;
  reasoning_log: ReasoningStep[];
}

export type ReasoningStepKind =
  | 'classify'
  | 'fetch'
  | 'parse'
  | 'infer_schema'
  | 'search_adapters'
  | 'generate_adapter'
  | 'test_fetch'
  | 'validate'
  | 'deploy'
  | 'human_assist'
  | 'decline'
  | 'cost_check'
  | 'note';

export interface ReasoningStep {
  kind: ReasoningStepKind;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface OnboarderSession {
  id: string;
  startedAt: number;
  steps: ReasoningStep[];
  costUsd: number;
  llmCalls: number;
  toolCalls: number;
  log(step: Omit<ReasoningStep, 'timestamp'>): void;
}

export type SourceClassification =
  | { kind: 'socrata'; confidence: number }
  | { kind: 'rest'; confidence: number }
  | { kind: 'rss'; confidence: number }
  | { kind: 'json-dump'; confidence: number }
  | { kind: 'tier_2'; reason: 'js_rendering' | 'auth_required' | 'pdf_inconsistent' | 'format_unrecognized'; confidence: number }
  | { kind: 'tier_3'; reason: 'paid_only' | 'no_digital_exposure'; confidence: number };

export interface ClassificationContext {
  url?: string;
  contentType?: string;
  bodySample?: string;
  status?: number;
}

export type { AdapterSpec };
