// services/architect/runtime/session-store.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3 (decomposition output validation, UI surface).
//
// Persistence helpers for architect_sessions and architect_proposals.
// Wraps the Supabase service-role client; tests inject a mock via the
// SessionStore interface.

import type {
  ArchitectProposalRow,
  ArchitectProposalType,
  ArchitectSessionRow,
  ArchitectSessionStatus,
  ArchitectSessionType,
  ArchitectTrigger,
  ReasoningEntry,
} from '@/services/architect/types';

export interface CreateSessionInput {
  vertical_id: string;
  session_type: ArchitectSessionType;
  trigger: ArchitectTrigger;
  input_payload: Record<string, unknown>;
  customer_org_id?: string | null;
}

export interface UpdateSessionInput {
  reasoning_log: ReasoningEntry[];
  output_payload?: Record<string, unknown> | null;
  status: ArchitectSessionStatus;
  failure_reason?: string | null;
  duration_ms: number;
  cost_usd: number;
  turns: number;
}

export interface CreateProposalInput {
  session_id: string;
  vertical_id: string;
  type: ArchitectProposalType;
  headline: string;
  body?: string | null;
  details: Record<string, unknown>;
  confidence: number;
  source_input_summary?: string | null;
}

export interface SessionStore {
  createSession(input: CreateSessionInput): Promise<ArchitectSessionRow>;
  updateSession(id: string, patch: UpdateSessionInput): Promise<void>;
  createProposal(input: CreateProposalInput): Promise<ArchitectProposalRow>;
}

class SupabaseSessionStore implements SessionStore {
  async createSession(input: CreateSessionInput): Promise<ArchitectSessionRow> {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const sb = supabaseAdmin() as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (cols?: string) => {
            single: () => Promise<{
              data: ArchitectSessionRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const { data, error } = await sb
      .from('architect_sessions')
      .insert({
        vertical_id: input.vertical_id,
        session_type: input.session_type,
        trigger: input.trigger,
        input_payload: input.input_payload,
        customer_org_id: input.customer_org_id ?? null,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`failed to create architect_session: ${error?.message ?? 'no data'}`);
    }
    return data;
  }

  async updateSession(id: string, patch: UpdateSessionInput): Promise<void> {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const sb = supabaseAdmin() as unknown as {
      from: (t: string) => {
        update: (row: Record<string, unknown>) => {
          eq: (
            col: string,
            val: string,
          ) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const completedAt =
      patch.status === 'completed' || patch.status === 'failed' || patch.status === 'timed_out'
        ? new Date().toISOString()
        : null;
    const { error } = await sb
      .from('architect_sessions')
      .update({
        reasoning_log: patch.reasoning_log,
        output_payload: patch.output_payload ?? null,
        status: patch.status,
        failure_reason: patch.failure_reason ?? null,
        duration_ms: patch.duration_ms,
        cost_usd: patch.cost_usd,
        turns: patch.turns,
        completed_at: completedAt,
      })
      .eq('id', id);
    if (error) throw new Error(`failed to update architect_session: ${error.message}`);
  }

  async createProposal(input: CreateProposalInput): Promise<ArchitectProposalRow> {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const sb = supabaseAdmin() as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (cols?: string) => {
            single: () => Promise<{
              data: ArchitectProposalRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const { data, error } = await sb
      .from('architect_proposals')
      .insert({
        session_id: input.session_id,
        vertical_id: input.vertical_id,
        type: input.type,
        headline: input.headline,
        body: input.body ?? null,
        details: input.details,
        confidence: input.confidence,
        source_input_summary: input.source_input_summary ?? null,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`failed to create architect_proposal: ${error?.message ?? 'no data'}`);
    }
    return data;
  }
}

let _store: SessionStore | null = null;
export function getSessionStore(): SessionStore {
  if (_store) return _store;
  _store = new SupabaseSessionStore();
  return _store;
}

// For tests.
export function setSessionStoreForTesting(store: SessionStore | null): void {
  _store = store;
}
