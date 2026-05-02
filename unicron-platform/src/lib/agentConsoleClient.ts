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
  return data as AgentDispatch;
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
