// Wave 2 / Stream W2-E — read-only aggregate of pathfinder.connectors +
// pathfinder.connector_audit_log for an at-a-glance system health view.
//
// Scope is intentionally narrow: counts + last-success per connector + 24h
// error rate. Per-connector drill-down lives in the existing settings UI.

export type ConnectorType = 'slack' | 'teams' | 'hubspot' | 'other';

// Mirrors pathfinder.connectors.status check constraint, plus the synthetic
// `unknown` bucket used when a row is present but its status doesn't match
// the canonical set (defense-in-depth against future schema drift).
export type ConnectorHealthStatus =
  | 'active'
  | 'pending'
  | 'expired'
  | 'error'
  | 'disconnected'
  | 'revoked'
  | 'unknown';

export interface ConnectorHealthRow {
  connector_id: string;
  customer_org_id: string;
  type: ConnectorType;
  status: ConnectorHealthStatus;
  account_name: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
}

export interface ConnectorsHealthRollup {
  generated_at: string;
  totals: {
    connectors: number;
    customers: number;
  };
  byType: Record<ConnectorType, number>;
  byStatus: Record<ConnectorHealthStatus, number>;
  errorRate24h: {
    total_events: number;
    failed_events: number;
    rate: number; // 0..1
  };
  mostRecentSuccessByConnector: ConnectorHealthRow[];
}

export const CONNECTOR_TYPES_HEALTH: ConnectorType[] = [
  'slack',
  'teams',
  'hubspot',
  'other',
];

export const CONNECTOR_STATUSES_HEALTH: ConnectorHealthStatus[] = [
  'active',
  'pending',
  'expired',
  'error',
  'disconnected',
  'revoked',
  'unknown',
];

/**
 * Map a raw `pathfinder.connectors.status` value into the dashboard's
 * normalized status. `connected` becomes `active` because the dashboard
 * speaks operator-facing language; everything not in the canonical check
 * constraint becomes `unknown` (avoid silently dropping rows).
 */
export function normalizeStatus(raw: string | null | undefined): ConnectorHealthStatus {
  switch (raw) {
    case 'connected':
      return 'active';
    case 'active':
    case 'pending':
    case 'expired':
    case 'error':
    case 'disconnected':
    case 'revoked':
      return raw;
    default:
      return 'unknown';
  }
}

export function normalizeType(raw: string | null | undefined): ConnectorType {
  switch (raw) {
    case 'slack':
    case 'teams':
    case 'hubspot':
      return raw;
    default:
      return 'other';
  }
}
