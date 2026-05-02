// lib/connectors/types.ts — shared types for the connector framework.
//
// Mirrors migration 0105 (pathfinder.connectors, connector_tokens,
// connector_routing_rules, connector_audit_log). Imported by every other
// file in lib/connectors/* and the API routes under app/api/connectors/*.

export type ConnectorType = 'slack' | 'teams' | 'hubspot';

export type ConnectorStatus =
  | 'disconnected'
  | 'pending'
  | 'connected'
  | 'error'
  | 'expired'
  | 'revoked';

export type AuditDirection = 'outbound' | 'inbound' | 'oauth' | 'refresh';
export type AuditStatus = 'sent' | 'received' | 'failed' | 'succeeded';

export interface ConnectorRow {
  id: string;
  customer_org_id: string;
  connector_type: ConnectorType;
  status: ConnectorStatus;
  account_name: string | null;
  account_external_id: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConnectorTokenPayload {
  access: string;
  refresh: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

export interface ConnectorRoutingRuleRow {
  id: string;
  connector_id: string;
  event_type: string;
  channel_id: string;
  channel_name: string | null;
  filter_json: Record<string, unknown>;
  quiet_hours_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InboundEvent {
  connector_id: string;
  type: 'message' | 'reaction' | 'command' | 'sync_event' | 'unknown';
  user_external_id: string | null;
  channel_id: string | null;
  payload: Record<string, unknown>;
  raw: unknown;
}

/** Throw to signal a connector type is plumbed but its sender isn't
 *  implemented yet. The dispatcher catches and logs it as `failed` with
 *  `direction='outbound'` so we can see the gap in the audit log. */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
