// Thin Supabase wrapper for the Agent Console foundation.
// Mirrors the call-site shape used by `architectClient.ts` / `sourceOnboarderClient.ts`.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type {
  AgentDispatch,
  AgentDispatchEvent,
  AgentDispatchEventType,
  AgentDispatchStatus,
} from './contracts/agentConsole';

const SCHEMA = 'unicron';
const TABLE_DISPATCHES = 'agent_dispatches';
const TABLE_EVENTS = 'agent_dispatch_events';

export interface CreateDispatchInput {
  agent_name: string;
  customer_org_id: string;
  input_payload: Record<string, unknown>;
  dispatched_by_user_id?: string | null;
  parent_dispatch_id?: string | null;
}

export async function createDispatch(input: CreateDispatchInput): Promise<AgentDispatch> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(TABLE_DISPATCHES)
    .insert({
      agent_name: input.agent_name,
      customer_org_id: input.customer_org_id,
      input_payload: input.input_payload,
      status: 'queued' as AgentDispatchStatus,
      dispatched_by_user_id: input.dispatched_by_user_id ?? null,
      parent_dispatch_id: input.parent_dispatch_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AgentDispatch;
}

export interface ListDispatchesFilter {
  agent_name?: string;
  customer_org_id?: string;
  status?: AgentDispatchStatus;
  /** Inclusive lower bound on created_at, ISO string. */
  since?: string;
  limit?: number;
}

export async function listDispatches(filter: ListDispatchesFilter = {}): Promise<AgentDispatch[]> {
  const supabase = getSupabase();
  let query = supabase
    .schema(SCHEMA)
    .from(TABLE_DISPATCHES)
    .select()
    .order('created_at', { ascending: false });

  if (filter.agent_name) query = query.eq('agent_name', filter.agent_name);
  if (filter.customer_org_id) query = query.eq('customer_org_id', filter.customer_org_id);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.since) query = query.gte('created_at', filter.since);

  query = query.limit(filter.limit ?? 50);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AgentDispatch[];
}

/**
 * Re-queue a failed dispatch by inserting a fresh row that copies the
 * original's `agent_name`, `customer_org_id`, and `input_payload`, and points
 * back at the parent via `parent_dispatch_id`. The new row starts in
 * `status='queued'` so it gets picked up by the dispatch worker on the next
 * cycle.
 *
 * Throws if the source dispatch does not exist or is not in `failed` state —
 * this is the operator-facing "force re-run" action and we intentionally
 * refuse to replay non-failed runs (use the agent's normal Run flow for that).
 */
export async function requeueDispatch(input: {
  dispatch_id: string;
  dispatched_by_user_id?: string | null;
}): Promise<AgentDispatch> {
  const original = await getDispatch(input.dispatch_id);
  if (!original) {
    throw new Error(`requeueDispatch: dispatch ${input.dispatch_id} not found`);
  }
  if (original.status !== 'failed') {
    throw new Error(
      `requeueDispatch: dispatch ${input.dispatch_id} is in status "${original.status}", only failed dispatches can be re-queued`,
    );
  }
  return createDispatch({
    agent_name: original.agent_name,
    customer_org_id: original.customer_org_id,
    input_payload: original.input_payload,
    dispatched_by_user_id:
      input.dispatched_by_user_id ?? original.dispatched_by_user_id ?? null,
    parent_dispatch_id: original.id,
  });
}

export async function getDispatch(id: string): Promise<AgentDispatch | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(TABLE_DISPATCHES)
    .select()
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as AgentDispatch | null;
}

export interface VerifyDispatchInput {
  id: string;
  verified_by_user_id: string;
  result_payload?: Record<string, unknown>;
  /** Phase 1F bridge: operator email for the agent_verifications mirror row. */
  verified_by_user_email?: string;
  /** Phase 1F bridge: human-readable summary for the activity ticker. Falls back to result_payload.summary. */
  summary?: string;
}

export async function verifyDispatch(input: VerifyDispatchInput): Promise<AgentDispatch> {
  const supabase = getSupabase();
  const update: Record<string, unknown> = {
    status: 'verified' as AgentDispatchStatus,
    verified_by_user_id: input.verified_by_user_id,
    verified_at: new Date().toISOString(),
  };
  if (input.result_payload) update.result_payload = input.result_payload;
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(TABLE_DISPATCHES)
    .update(update)
    .eq('id', input.id)
    .select()
    .single();
  if (error) throw error;
  const dispatch = data as AgentDispatch;

  // Phase 1F bridge: mirror to pathfinder.agent_verifications for the customer
  // activity ticker. Non-blocking — a write failure here must never surface to
  // the operator or roll back the unicorn-side verify.
  const bridgeSummary =
    input.summary ??
    (typeof input.result_payload?.summary === 'string'
      ? input.result_payload.summary
      : '');
  if (bridgeSummary && dispatch.customer_org_id) {
    supabase
      .schema('pathfinder')
      .from('agent_verifications')
      .insert({
        dispatch_id: dispatch.id,
        customer_org_id: dispatch.customer_org_id,
        agent_name: dispatch.agent_name,
        verified_by_user_id: input.verified_by_user_id,
        verified_by_user_email: input.verified_by_user_email ?? '',
        summary: bridgeSummary,
      })
      .then(({ error: bridgeErr }) => {
        if (bridgeErr) console.error('[Phase1F] agent_verifications write failed:', bridgeErr);
      });
  }

  return dispatch;
}

export interface RejectDispatchInput {
  id: string;
  verified_by_user_id: string;
  rejection_reason: string;
}

export async function rejectDispatch(input: RejectDispatchInput): Promise<AgentDispatch> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(TABLE_DISPATCHES)
    .update({
      status: 'rejected' as AgentDispatchStatus,
      verified_by_user_id: input.verified_by_user_id,
      verified_at: new Date().toISOString(),
      rejection_reason: input.rejection_reason,
    })
    .eq('id', input.id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentDispatch;
}

export interface AppendEventInput {
  dispatch_id: string;
  event_type: AgentDispatchEventType;
  payload: Record<string, unknown>;
}

export async function appendEvent(input: AppendEventInput): Promise<AgentDispatchEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(TABLE_EVENTS)
    .insert({
      dispatch_id: input.dispatch_id,
      event_type: input.event_type,
      payload: input.payload,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AgentDispatchEvent;
}

export async function listEvents(dispatchId: string, sinceCreatedAt?: string): Promise<AgentDispatchEvent[]> {
  const supabase = getSupabase();
  let query = supabase
    .schema(SCHEMA)
    .from(TABLE_EVENTS)
    .select()
    .eq('dispatch_id', dispatchId)
    .order('created_at', { ascending: true });
  if (sinceCreatedAt) query = query.gt('created_at', sinceCreatedAt);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AgentDispatchEvent[];
}

/**
 * Subscribe to inserts on `unicron.agent_dispatch_events` for a single dispatch.
 * Returns an `unsubscribe` function. The Realtime channel filters server-side
 * so an idle dispatch costs nothing.
 *
 * Caller is responsible for invoking the returned unsubscribe in cleanup
 * (e.g. React `useEffect` return).
 */
export function subscribeToEvents(
  dispatchId: string,
  onEvent: (event: AgentDispatchEvent) => void,
): () => void {
  const supabase = getSupabase();
  const channel: RealtimeChannel = supabase
    .channel(`agent_dispatch_events:${dispatchId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: SCHEMA,
        table: TABLE_EVENTS,
        filter: `dispatch_id=eq.${dispatchId}`,
      },
      (payload) => {
        onEvent(payload.new as AgentDispatchEvent);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
