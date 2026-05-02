// GET /api/cron/connector-token-refresh
//
// Nightly token-refresh sweep. Reads pathfinder.connector_tokens for
// active rows expiring within 24 hours that have a refresh token, calls
// each provider's refresh endpoint, and writes the rotated token back
// via rotateToken (atomic revoke-old + insert-new).
//
// Auth via CRON_SECRET, identical to the other Pathfinder crons.
// Telemetry via openAgentRun / closeAgentRun (Z-D heartbeat pattern).
// Fail-open: a single connector's refresh failure marks that connector
// status='expired' but does NOT abort the sweep.
//
// C-1A scope: slack refresh is implemented end-to-end. Teams + HubSpot
// hit a stub that records a `failed` audit row and skips — full
// implementations land in C-2 / Phase 3.

import { NextResponse } from 'next/server';

import { closeAgentRun, openAgentRun } from '@/lib/agent-runs';
import { recordAudit } from '@/lib/connectors/audit';
import { getToken, rotateToken } from '@/lib/connectors/tokens';
import { NotImplementedError } from '@/lib/connectors/types';
import type { ConnectorTokenPayload, ConnectorType } from '@/lib/connectors/types';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === secret;
}

interface ExpiringRow {
  id: string;
  connector_id: string;
  expires_at: string;
  connectors: {
    id: string;
    customer_org_id: string;
    connector_type: ConnectorType;
    status: string;
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const run = await openAgentRun('connector-refresh');

  let candidates: ExpiringRow[];
  try {
    candidates = await loadExpiringTokens();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await closeAgentRun(run, { status: 'failed', error_message: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (candidates.length === 0) {
    await closeAgentRun(run, { status: 'empty_queue', records_processed: 0, records_new: 0 });
    return NextResponse.json({ ok: true, candidates: 0, refreshed: 0, failed: 0 });
  }

  let refreshed = 0;
  let failed = 0;

  for (const row of candidates) {
    const connectorId = row.connector_id;
    const connectorType = row.connectors.connector_type;
    const orgId = row.connectors.customer_org_id;
    try {
      const current = await getToken(connectorId);
      if (!current || !current.refresh) {
        // No refresh token to use — mark expired so the UI prompts
        // the user to re-auth.
        await markExpired(connectorId);
        await recordAudit({
          connector_id: connectorId,
          customer_org_id: orgId,
          event_type: 'token.refresh',
          direction: 'refresh',
          status: 'failed',
          error_message: 'no refresh token on file',
        });
        failed += 1;
        continue;
      }
      const next = await refreshForProvider(connectorType, current.refresh);
      await rotateToken(connectorId, next);
      await recordAudit({
        connector_id: connectorId,
        customer_org_id: orgId,
        event_type: 'token.refresh',
        direction: 'refresh',
        status: 'succeeded',
        payload_summary: { connector_type: connectorType },
      });
      refreshed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markExpired(connectorId);
      await recordAudit({
        connector_id: connectorId,
        customer_org_id: orgId,
        event_type: 'token.refresh',
        direction: 'refresh',
        status: 'failed',
        error_message: message,
      });
      failed += 1;
    }
  }

  await closeAgentRun(run, {
    status: 'success',
    records_processed: candidates.length,
    records_new: refreshed,
  });

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    refreshed,
    failed,
  });
}

async function loadExpiringTokens(): Promise<ExpiringRow[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        is: (
          col: string,
          v: null,
        ) => {
          not: (
            col: string,
            op: 'is',
            v: null,
          ) => {
            lte: (
              col: string,
              v: string,
            ) => Promise<{
              data: ExpiringRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const cutoff = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const res = await sb
    .from('connector_tokens')
    .select(
      `id, connector_id, expires_at,
       connectors!inner ( id, customer_org_id, connector_type, status )`,
    )
    .is('revoked_at', null)
    .not('refresh_token_encrypted', 'is', null)
    .lte('expires_at', cutoff);
  if (res.error) throw new Error(`loadExpiringTokens failed: ${res.error.message}`);
  return res.data ?? [];
}

async function markExpired(connectorId: string): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await sb.from('connectors').update({ status: 'expired' }).eq('id', connectorId);
}

async function refreshForProvider(
  type: ConnectorType,
  refreshToken: string,
): Promise<ConnectorTokenPayload> {
  if (type === 'slack') {
    return refreshSlack(refreshToken);
  }
  // Teams + HubSpot ship in C-2 / Phase 3.
  throw new NotImplementedError(`refresh not implemented for ${type} (C-1A scope: slack only)`);
}

interface SlackRefreshResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

async function refreshSlack(refreshToken: string): Promise<ConnectorTokenPayload> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as SlackRefreshResponse;
  if (!json.ok || !json.access_token) {
    throw new Error(`slack refresh error: ${json.error ?? 'unknown'}`);
  }
  return {
    access: json.access_token,
    refresh: json.refresh_token ?? null,
    expiresAt:
      typeof json.expires_in === 'number' ? new Date(Date.now() + json.expires_in * 1000) : null,
    scope: json.scope ?? null,
  };
}
