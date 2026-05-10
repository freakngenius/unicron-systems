// Wave 2 / Stream W2-E — read-only aggregate of pathfinder.connectors +
// pathfinder.connector_audit_log. Computes the rollup the dashboard
// renders (totals, byType, byStatus, mostRecentSuccess, 24h error rate).
//
// RLS allows anon SELECT on pathfinder.connectors + connector_audit_log
// when the service role policy or cross-tenant policy is in place; if anon
// access is refused, the call surfaces the Supabase error to the caller
// (the view renders an inline error).

import { getSupabase } from '../supabase';
import {
  CONNECTOR_STATUSES_HEALTH,
  CONNECTOR_TYPES_HEALTH,
  normalizeStatus,
  normalizeType,
  type ConnectorHealthRow,
  type ConnectorHealthStatus,
  type ConnectorType,
  type ConnectorsHealthRollup,
} from '../contracts/connectorsHealth';

// Raw shapes — mirror the columns we read off Supabase. The DB uses
// `connector_type` + the `pathfinder.connectors.status` values, which we
// translate into the dashboard vocabulary inside the rollup.
export interface ConnectorRowRaw {
  id: string;
  customer_org_id: string;
  connector_type: string;
  status: string;
  account_name: string | null;
  last_error: string | null;
}

export interface ConnectorAuditEventRaw {
  connector_id: string;
  status: string; // 'sent' | 'received' | 'failed' | 'succeeded'
  created_at: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Successful audit-log statuses. `sent` + `succeeded` + `received` all
 *  count — the audit table records direction independently, and any of
 *  the three indicates the connector is healthy enough to round-trip. */
function isSuccess(status: string): boolean {
  return status === 'succeeded' || status === 'sent' || status === 'received';
}

function isFailed(status: string): boolean {
  return status === 'failed';
}

function emptyByType(): Record<ConnectorType, number> {
  return CONNECTOR_TYPES_HEALTH.reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<ConnectorType, number>,
  );
}

function emptyByStatus(): Record<ConnectorHealthStatus, number> {
  return CONNECTOR_STATUSES_HEALTH.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<ConnectorHealthStatus, number>,
  );
}

/**
 * Pure aggregator. Exported (under `__` prefix) for unit testing without
 * Supabase. `now` is injected so tests pin the 24h window deterministically.
 */
export function __computeRollup(
  rows: ConnectorRowRaw[],
  events: ConnectorAuditEventRaw[],
  now: Date = new Date(),
): ConnectorsHealthRollup {
  const cutoffMs = now.getTime() - ONE_DAY_MS;

  const byType = emptyByType();
  const byStatus = emptyByStatus();
  const customers = new Set<string>();

  for (const row of rows) {
    const type = normalizeType(row.connector_type);
    const status = normalizeStatus(row.status);
    byType[type] += 1;
    byStatus[status] += 1;
    customers.add(row.customer_org_id);
  }

  // 24h error rate over connector_audit_log
  let total24 = 0;
  let failed24 = 0;
  // most recent success timestamp per connector
  const lastSuccess = new Map<string, string>();
  const lastError = new Map<string, string>();

  for (const ev of events) {
    const ms = Date.parse(ev.created_at);
    if (Number.isFinite(ms)) {
      if (ms >= cutoffMs) {
        total24 += 1;
        if (isFailed(ev.status)) failed24 += 1;
      }
    }
    if (isSuccess(ev.status)) {
      const prev = lastSuccess.get(ev.connector_id);
      if (!prev || ev.created_at > prev) lastSuccess.set(ev.connector_id, ev.created_at);
    }
    if (isFailed(ev.status)) {
      const prev = lastError.get(ev.connector_id);
      if (!prev || ev.created_at > prev) lastError.set(ev.connector_id, ev.created_at);
    }
  }

  const mostRecentSuccessByConnector: ConnectorHealthRow[] = rows.map((r) => ({
    connector_id: r.id,
    customer_org_id: r.customer_org_id,
    type: normalizeType(r.connector_type),
    status: normalizeStatus(r.status),
    account_name: r.account_name,
    last_success_at: lastSuccess.get(r.id) ?? null,
    last_error_at: lastError.get(r.id) ?? null,
    last_error_message: r.last_error,
  }));

  return {
    generated_at: now.toISOString(),
    totals: {
      connectors: rows.length,
      customers: customers.size,
    },
    byType,
    byStatus,
    errorRate24h: {
      total_events: total24,
      failed_events: failed24,
      rate: total24 === 0 ? 0 : failed24 / total24,
    },
    mostRecentSuccessByConnector,
  };
}

/**
 * Read pathfinder.connectors + last 24h of pathfinder.connector_audit_log
 * and return the dashboard rollup. Returns a zeroed rollup when no rows are
 * present in Supabase.
 */
export async function fetchConnectorsHealth(): Promise<ConnectorsHealthRollup> {
  const supabase = getSupabase();
  // Pull a 7d window for last_success even though rate is 24h. Most ops will
  // see something within 7d; rows with no event in 7d render `—`.
  const since7dIso = new Date(Date.now() - 7 * ONE_DAY_MS).toISOString();

  const [connRes, auditRes] = await Promise.all([
    supabase
      .schema('pathfinder')
      .from('connectors')
      .select('id, customer_org_id, connector_type, status, account_name, last_error'),
    supabase
      .schema('pathfinder')
      .from('connector_audit_log')
      .select('connector_id, status, created_at')
      .gte('created_at', since7dIso),
  ]);

  if (connRes.error) throw connRes.error;
  if (auditRes.error) throw auditRes.error;

  const rows = (connRes.data ?? []) as ConnectorRowRaw[];
  const events = (auditRes.data ?? []) as ConnectorAuditEventRaw[];
  return __computeRollup(rows, events, new Date());
}
