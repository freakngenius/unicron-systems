// lib/connectors/audit.ts — append-only audit log writer.
//
// Every outbound dispatch, inbound webhook, OAuth callback, and refresh
// cron records one row in pathfinder.connector_audit_log. The writer is
// fail-open: a logging failure must never propagate to the caller (we
// don't want a transient supabase hiccup to skip a Slack alert).
//
// payload_summary is bounded — we hash long fields and truncate strings
// so a 5MB Slack message body doesn't bloat the audit table. The
// summary is for "what happened" reconstruction, not full payload
// replay.

import { supabaseAdmin } from '@/lib/supabase';
import type { AuditDirection, AuditStatus } from './types';

export interface AuditRecord {
  connector_id: string;
  customer_org_id: string;
  event_type: string;
  direction: AuditDirection;
  status: AuditStatus;
  payload_summary?: Record<string, unknown> | null;
  error_message?: string | null;
}

/** Bound a value to a small JSON-safe summary. Strings are clipped to
 *  240 chars; arrays and objects are kept but their inner strings
 *  clipped. Numbers/booleans/null pass through. */
function summarize(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[depth-limit]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return value.length > 240 ? `${value.slice(0, 237)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => summarize(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (count >= 25) {
        out['__truncated__'] = true;
        break;
      }
      out[k] = summarize(v, depth + 1);
      count += 1;
    }
    return out;
  }
  return String(value);
}

interface AuditInsert {
  connector_id: string;
  customer_org_id: string;
  event_type: string;
  direction: AuditDirection;
  status: AuditStatus;
  payload_summary: Record<string, unknown> | null;
  error_message: string | null;
}

/** Write one audit row. Fail-open. */
export async function recordAudit(rec: AuditRecord): Promise<void> {
  const insert: AuditInsert = {
    connector_id: rec.connector_id,
    customer_org_id: rec.customer_org_id,
    event_type: rec.event_type,
    direction: rec.direction,
    status: rec.status,
    payload_summary:
      rec.payload_summary === undefined || rec.payload_summary === null
        ? null
        : (summarize(rec.payload_summary) as Record<string, unknown>),
    error_message: rec.error_message ?? null,
  };
  try {
    const sb = supabaseAdmin() as unknown as {
      from: (t: string) => {
        insert: (rows: AuditInsert) => Promise<{ error: { message: string } | null }>;
      };
    };
    await sb.from('connector_audit_log').insert(insert);
  } catch {
    // fail-open per the contract above.
  }
}
