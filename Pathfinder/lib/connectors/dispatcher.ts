// lib/connectors/dispatcher.ts — outbound event router.
//
// Single entry point for every event-emitting agent in Pathfinder. Maps
// (orgId, eventType) → set of routing rules → connector → formatted
// message → provider send. Fail-open: a connector send error never
// propagates back to the caller; it lands in connector_audit_log as
// `direction='outbound', status='failed'` and the next rule in the loop
// continues unaffected.
//
// SPEC § 3.6 reference. The slack-specific send + format implementations
// land in C-1B; for C-1A we plumb the dispatcher with NotImplemented
// throws on every connector type so the audit log shows the gap and
// agents can already call dispatchEvent without changing their code
// later.
//
// Per-org isolation is enforced two ways:
//   1. The query joins customer_org_id from the connectors table; we
//      never read rules without confirming the connector belongs to the
//      requested org.
//   2. The audit row records customer_org_id (denormalized) so a
//      cross-tenant misroute would surface immediately in audit queries.

import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from './audit';
import { NotImplementedError } from './types';
import type {
  ConnectorRoutingRuleRow,
  ConnectorRow,
  ConnectorType,
} from './types';

interface RuleWithConnector {
  rule: ConnectorRoutingRuleRow;
  connector: ConnectorRow;
}

export interface DispatchResult {
  org_id: string;
  event_type: string;
  rules_evaluated: number;
  sent: number;
  skipped_filter: number;
  skipped_status: number;
  failed: number;
}

export interface FormattedMessage {
  type: ConnectorType;
  eventType: string;
  payload: Record<string, unknown>;
}

/** Filter matcher. Supports a tiny, deliberately limited DSL:
 *   - top-level keys are field names
 *   - values are matched literal-equal OR by `{ ">=": n }` / `{ "<=": n }` etc.
 *   - empty filter means "match everything"
 *
 * Anything more sophisticated belongs in a rules engine, not here.
 */
export function matchesFilter(
  payload: Record<string, unknown>,
  filter: Record<string, unknown> | null | undefined,
): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [key, expected] of Object.entries(filter)) {
    const actual = payload[key];
    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      for (const [op, opVal] of Object.entries(expected as Record<string, unknown>)) {
        if (typeof actual !== 'number' || typeof opVal !== 'number') return false;
        if (op === '>=' && !(actual >= opVal)) return false;
        if (op === '<=' && !(actual <= opVal)) return false;
        if (op === '>' && !(actual > opVal)) return false;
        if (op === '<' && !(actual < opVal)) return false;
        if (op === '==' && actual !== opVal) return false;
        if (op === '!=' && actual === opVal) return false;
      }
    } else if (Array.isArray(expected)) {
      if (!expected.includes(actual as string | number | boolean)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/** Format an event payload for a specific connector type. C-1A is a
 *  pass-through skeleton; C-1B replaces slack with Block Kit, C-2 adds
 *  Adaptive Cards for teams. */
export function formatForConnector(
  type: ConnectorType,
  eventType: string,
  payload: Record<string, unknown>,
): FormattedMessage {
  return { type, eventType, payload };
}

/** Send a formatted message via the connector. C-1B fills slack;
 *  teams + hubspot throw NotImplementedError until later phases. The
 *  dispatcher catches the throw and records `failed` audit. */
export async function sendToConnector(
  connector: ConnectorRow,
  _channelId: string,
  _formatted: FormattedMessage,
): Promise<void> {
  switch (connector.connector_type) {
    case 'slack':
      throw new NotImplementedError(
        'slack send not implemented in C-1A (lands in C-1B). Dispatcher plumbing only.',
      );
    case 'teams':
      throw new NotImplementedError('teams send not implemented (C-2).');
    case 'hubspot':
      throw new NotImplementedError('hubspot send not implemented (Phase 3).');
    default:
      throw new NotImplementedError(`unknown connector type: ${connector.connector_type}`);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Test seams. C-1B will replace these by importing the real slack sender.
// ────────────────────────────────────────────────────────────────────────

let _rulesLoaderOverride:
  | ((orgId: string, eventType: string) => Promise<RuleWithConnector[]>)
  | null = null;
let _senderOverride:
  | ((connector: ConnectorRow, channelId: string, formatted: FormattedMessage) => Promise<void>)
  | null = null;

export function __setDispatcherTestHooks(opts: {
  loadRules?: (orgId: string, eventType: string) => Promise<RuleWithConnector[]>;
  send?: (
    connector: ConnectorRow,
    channelId: string,
    formatted: FormattedMessage,
  ) => Promise<void>;
}): void {
  _rulesLoaderOverride = opts.loadRules ?? null;
  _senderOverride = opts.send ?? null;
}

export function __resetDispatcherTestHooks(): void {
  _rulesLoaderOverride = null;
  _senderOverride = null;
}

async function resolveLoad(orgId: string, eventType: string): Promise<RuleWithConnector[]> {
  if (_rulesLoaderOverride) return _rulesLoaderOverride(orgId, eventType);
  return loadActiveRules(orgId, eventType);
}

async function resolveSend(
  connector: ConnectorRow,
  channelId: string,
  formatted: FormattedMessage,
): Promise<void> {
  if (_senderOverride) return _senderOverride(connector, channelId, formatted);
  return sendToConnector(connector, channelId, formatted);
}

/** Public dispatch entry. Always resolves; never throws. Per SPEC § 3.6. */
export async function dispatchEvent(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<DispatchResult> {
  const result: DispatchResult = {
    org_id: orgId,
    event_type: eventType,
    rules_evaluated: 0,
    sent: 0,
    skipped_filter: 0,
    skipped_status: 0,
    failed: 0,
  };
  let rules: RuleWithConnector[] = [];
  try {
    rules = await resolveLoad(orgId, eventType);
  } catch {
    return result;
  }
  result.rules_evaluated = rules.length;

  for (const { rule, connector } of rules) {
    if (connector.status !== 'connected') {
      result.skipped_status += 1;
      continue;
    }
    if (!matchesFilter(payload, rule.filter_json)) {
      result.skipped_filter += 1;
      continue;
    }
    try {
      const formatted = formatForConnector(connector.connector_type, eventType, payload);
      await resolveSend(connector, rule.channel_id, formatted);
      await recordAudit({
        connector_id: connector.id,
        customer_org_id: connector.customer_org_id,
        event_type: eventType,
        direction: 'outbound',
        status: 'sent',
        payload_summary: { channel_id: rule.channel_id, channel_name: rule.channel_name },
      });
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await recordAudit({
        connector_id: connector.id,
        customer_org_id: connector.customer_org_id,
        event_type: eventType,
        direction: 'outbound',
        status: 'failed',
        payload_summary: { channel_id: rule.channel_id },
        error_message: message,
      });
      // fail-open
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────
// Internal — Supabase-backed loader.
// ────────────────────────────────────────────────────────────────────────

interface RawRuleRow {
  id: string;
  connector_id: string;
  event_type: string;
  channel_id: string;
  channel_name: string | null;
  filter_json: Record<string, unknown> | null;
  quiet_hours_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  connectors: {
    id: string;
    customer_org_id: string;
    connector_type: ConnectorType;
    status: ConnectorRow['status'];
    account_name: string | null;
    account_external_id: string | null;
    connected_at: string | null;
    disconnected_at: string | null;
    last_error: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  };
}

async function loadActiveRules(orgId: string, eventType: string): Promise<RuleWithConnector[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            col: string,
            v: string | boolean,
          ) => {
            eq: (
              col: string,
              v: string | boolean,
            ) => Promise<{
              data: RawRuleRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const res = await sb
    .from('connector_routing_rules')
    .select(
      `
      id, connector_id, event_type, channel_id, channel_name,
      filter_json, quiet_hours_json, is_active, created_at, updated_at,
      connectors!inner (
        id, customer_org_id, connector_type, status, account_name,
        account_external_id, connected_at, disconnected_at, last_error,
        metadata, created_at, updated_at
      )
    `,
    )
    .eq('event_type', eventType)
    .eq('is_active', true)
    .eq('connectors.customer_org_id', orgId);
  if (res.error) {
    throw new Error(`loadActiveRules failed: ${res.error.message}`);
  }
  const rows = res.data ?? [];
  return rows.map<RuleWithConnector>((r) => ({
    rule: {
      id: r.id,
      connector_id: r.connector_id,
      event_type: r.event_type,
      channel_id: r.channel_id,
      channel_name: r.channel_name,
      filter_json: r.filter_json ?? {},
      quiet_hours_json: r.quiet_hours_json,
      is_active: r.is_active,
      created_at: r.created_at,
      updated_at: r.updated_at,
    },
    connector: {
      id: r.connectors.id,
      customer_org_id: r.connectors.customer_org_id,
      connector_type: r.connectors.connector_type,
      status: r.connectors.status,
      account_name: r.connectors.account_name,
      account_external_id: r.connectors.account_external_id,
      connected_at: r.connectors.connected_at,
      disconnected_at: r.connectors.disconnected_at,
      last_error: r.connectors.last_error,
      metadata: r.connectors.metadata,
      created_at: r.connectors.created_at,
      updated_at: r.connectors.updated_at,
    },
  }));
}
