// lib/connectors/registry.ts — read/write helpers for the
// pathfinder.connectors row itself. Token storage lives in tokens.ts; this
// module only manipulates the metadata row (status, account_name,
// account_external_id). Routes and the OAuth callback compose both.

import { supabaseAdmin } from '@/lib/supabase';

import type { ConnectorType } from '@/lib/connectors/types';

export interface ConnectorRow {
  id: string;
  customerOrgId: string;
  connectorType: ConnectorType;
  status: 'disconnected' | 'pending' | 'connected' | 'error' | 'expired' | 'revoked';
  accountName: string | null;
  accountExternalId: string | null;
  metadata: Record<string, unknown>;
}

interface RawConnectorRow {
  id: string;
  customer_org_id: string;
  connector_type: ConnectorType;
  status: ConnectorRow['status'];
  account_name: string | null;
  account_external_id: string | null;
  metadata: Record<string, unknown> | null;
}

function mapRow(r: RawConnectorRow): ConnectorRow {
  return {
    id: r.id,
    customerOrgId: r.customer_org_id,
    connectorType: r.connector_type,
    status: r.status,
    accountName: r.account_name,
    accountExternalId: r.account_external_id,
    metadata: r.metadata ?? {},
  };
}

/**
 * Look up the connector row for an (org, type) pair. Returns null when
 * none exists yet.
 */
export async function getConnector(
  orgId: string,
  type: ConnectorType,
): Promise<ConnectorRow | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const r = await sb
    .from('connectors')
    .select('*')
    .eq('customer_org_id', orgId)
    .eq('connector_type', type)
    .maybeSingle();
  if (r.error || !r.data) return null;
  return mapRow(r.data as unknown as RawConnectorRow);
}

/**
 * Look up a connector by external id (Slack team_id, Teams tenant id,
 * HubSpot portal id). Used by inbound webhook routes to resolve the
 * tenant from a request payload.
 */
export async function getConnectorByExternalId(
  type: ConnectorType,
  externalId: string,
): Promise<ConnectorRow | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const r = await sb
    .from('connectors')
    .select('*')
    .eq('connector_type', type)
    .eq('account_external_id', externalId)
    .maybeSingle();
  if (r.error || !r.data) return null;
  return mapRow(r.data as unknown as RawConnectorRow);
}

export interface UpsertConnectorArgs {
  customerOrgId: string;
  connectorType: ConnectorType;
  accountName: string;
  accountExternalId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Upsert by (customer_org_id, connector_type). Used by the OAuth
 * callback — once we exchange the code we know `account_external_id`
 * and `account_name` and can mark the row pending until the token row
 * is in place (`storeToken` flips to connected).
 */
export async function upsertConnector(args: UpsertConnectorArgs): Promise<ConnectorRow> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: (cols: string) => Promise<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const r = await sb
    .from('connectors')
    .upsert(
      {
        customer_org_id: args.customerOrgId,
        connector_type: args.connectorType,
        status: 'pending',
        account_name: args.accountName,
        account_external_id: args.accountExternalId,
        metadata: args.metadata ?? {},
      },
      { onConflict: 'customer_org_id,connector_type' },
    )
    .select('*');
  if (r.error || !r.data || r.data.length === 0) {
    throw new Error(`connectors upsert failed: ${r.error?.message ?? 'no row returned'}`);
  }
  return mapRow(r.data[0] as unknown as RawConnectorRow);
}

export async function markConnectorError(
  connectorId: string,
  message: string,
): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await sb
    .from('connectors')
    .update({ status: 'error', last_error: message })
    .eq('id', connectorId);
}
