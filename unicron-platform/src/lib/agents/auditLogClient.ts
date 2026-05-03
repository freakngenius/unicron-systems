// Read-only client for the operator audit log surface.
//
// Backed by `unicron.agent_dispatches` rows where `verified_at IS NOT NULL` —
// i.e. every dispatch a human has cleared (verified or rejected). Mirrors
// the Supabase chain pattern from `agentConsoleClient.ts`.
//
// Single-table view: no joins. Scope is "who verified what dispatch when?".

import { getSupabase } from '../supabase';
import type { AgentDispatch } from '../contracts/agentConsole';

const SCHEMA = 'unicron';
const TABLE_DISPATCHES = 'agent_dispatches';

/** Hard cap, enforced server-side via .limit(). UI requests in pages of 50. */
export const AUDIT_LOG_PAGE_SIZE = 50;

export type AuditLogTimeWindow = '24h' | '7d' | '30d' | 'all';

export interface ListAuditLogFilter {
  /** Case-insensitive substring match on `verified_by_user_id`. */
  verified_by?: string;
  /** Exact match on `agent_name`. */
  agent_name?: string;
  /** Window relative to "now" — server-side via .gte('verified_at', ...). */
  window?: AuditLogTimeWindow;
  /** Page number, zero-indexed. */
  page?: number;
}

export interface ListAuditLogResult {
  rows: AgentDispatch[];
  /** Whether another page is likely available (i.e. we filled the page). */
  hasMore: boolean;
  /** Page that was returned. */
  page: number;
}

export function timeWindowToSinceIso(
  window: AuditLogTimeWindow,
  now: Date = new Date(),
): string | null {
  if (window === 'all') return null;
  const ms =
    window === '24h'
      ? 24 * 60 * 60 * 1000
      : window === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms).toISOString();
}

export async function listAuditLog(
  filter: ListAuditLogFilter = {},
): Promise<ListAuditLogResult> {
  const page = Math.max(0, filter.page ?? 0);
  const supabase = getSupabase();

  let query = supabase
    .schema(SCHEMA)
    .from(TABLE_DISPATCHES)
    .select()
    .not('verified_at', 'is', null)
    .order('verified_at', { ascending: false });

  if (filter.agent_name) query = query.eq('agent_name', filter.agent_name);
  if (filter.verified_by) query = query.ilike('verified_by_user_id', `%${filter.verified_by}%`);
  const since = filter.window ? timeWindowToSinceIso(filter.window) : null;
  if (since) query = query.gte('verified_at', since);

  const from = page * AUDIT_LOG_PAGE_SIZE;
  const to = from + AUDIT_LOG_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as AgentDispatch[];
  return {
    rows,
    hasMore: rows.length === AUDIT_LOG_PAGE_SIZE,
    page,
  };
}

/**
 * Best-effort one-line summary derived from input/result payloads.
 * Single-table contract — we don't join. Used only for table display.
 */
export function summarizeDispatch(dispatch: AgentDispatch): string {
  const candidates: Array<unknown> = [
    (dispatch.result_payload as Record<string, unknown> | null)?.summary,
    (dispatch.result_payload as Record<string, unknown> | null)?.headline,
    (dispatch.input_payload as Record<string, unknown> | null)?.summary,
    (dispatch.input_payload as Record<string, unknown> | null)?.prompt,
    (dispatch.input_payload as Record<string, unknown> | null)?.query,
    (dispatch.input_payload as Record<string, unknown> | null)?.title,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      const trimmed = c.trim();
      return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
    }
  }
  return dispatch.status === 'rejected' ? 'Rejected dispatch' : 'Verified dispatch';
}
