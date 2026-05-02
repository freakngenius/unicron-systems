// lib/connectors/queries.ts — server-side reads against the connector
// schema. Used by the Settings page server component AND the
// /api/connectors/list endpoint so both share one shape.
//
// All reads use the service-role client (`supabaseAdmin`) for two
// reasons: (1) `pathfinder.connector_tokens` is service-role-only via
// RLS, and routing-rule reads currently rely on the same service role
// for consistency; (2) the page is rendered server-side under
// basic-auth, so anon-key RLS would refuse without a JWT. The PUBLIC
// surface never sees a token — only the connector + rule rows, which
// are token-free by design.

import { supabaseAdmin } from '@/lib/supabase';
import type {
  ConnectorRoutingRule,
  ConnectorRow,
  ConnectorStatus,
  ConnectorType,
} from '@/lib/types';

export const CONNECTOR_TYPES: ConnectorType[] = ['slack', 'teams', 'hubspot'];

export interface ConnectorListItem {
  type: ConnectorType;
  status: ConnectorStatus;
  row: ConnectorRow | null;
  routingRuleCount: number;
  recentActivityCount: number;
  lastActivityAt: string | null;
}

/**
 * Fetch the connector + auxiliary stats for one org. Returns a row per
 * connector type even when there is no underlying DB row (the
 * "disconnected" tile state synthesizes from absence).
 */
export async function listConnectors(orgId: string): Promise<ConnectorListItem[]> {
  const admin = supabaseAdmin();
  const { data: connectors, error: connErr } = await admin
    .from('connectors')
    .select('*')
    .eq('customer_org_id', orgId);

  if (connErr) {
    // Fail open — don't crash the settings page if the connector schema
    // is mid-deploy. Empty list reads as "all disconnected" and the UI
    // surfaces an inline error banner upstream if needed.
    return CONNECTOR_TYPES.map((t) => synthDisconnected(t));
  }

  const rows = (connectors ?? []) as ConnectorRow[];
  const ids = rows.map((r) => r.id);

  // Routing rule counts per connector
  const ruleCounts = new Map<string, number>();
  const activityCounts = new Map<string, number>();
  const lastActivity = new Map<string, string>();

  if (ids.length > 0) {
    const { data: rules } = await admin
      .from('connector_routing_rules')
      .select('connector_id, is_active')
      .in('connector_id', ids)
      .eq('is_active', true);

    for (const rule of (rules ?? []) as { connector_id: string }[]) {
      ruleCounts.set(rule.connector_id, (ruleCounts.get(rule.connector_id) ?? 0) + 1);
    }

    // Recent activity (last 7 days) per connector
    const cutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: audits } = await admin
      .from('connector_audit_log')
      .select('connector_id, created_at')
      .in('connector_id', ids)
      .gte('created_at', cutoffIso);

    for (const audit of (audits ?? []) as { connector_id: string; created_at: string }[]) {
      activityCounts.set(audit.connector_id, (activityCounts.get(audit.connector_id) ?? 0) + 1);
      const prev = lastActivity.get(audit.connector_id);
      if (!prev || audit.created_at > prev) lastActivity.set(audit.connector_id, audit.created_at);
    }
  }

  const byType = new Map<ConnectorType, ConnectorRow>();
  for (const row of rows) byType.set(row.connector_type, row);

  return CONNECTOR_TYPES.map((t) => {
    const row = byType.get(t);
    if (!row) return synthDisconnected(t);
    return {
      type: t,
      status: row.status,
      row,
      routingRuleCount: ruleCounts.get(row.id) ?? 0,
      recentActivityCount: activityCounts.get(row.id) ?? 0,
      lastActivityAt: lastActivity.get(row.id) ?? null,
    };
  });
}

function synthDisconnected(type: ConnectorType): ConnectorListItem {
  return {
    type,
    status: 'disconnected',
    row: null,
    routingRuleCount: 0,
    recentActivityCount: 0,
    lastActivityAt: null,
  };
}

export async function getConnectorById(connectorId: string): Promise<ConnectorRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('connectors')
    .select('*')
    .eq('id', connectorId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ConnectorRow;
}

export async function listRoutingRules(connectorId: string): Promise<ConnectorRoutingRule[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('connector_routing_rules')
    .select('*')
    .eq('connector_id', connectorId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as ConnectorRoutingRule[];
}
