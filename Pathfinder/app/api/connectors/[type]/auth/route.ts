// GET /api/connectors/[type]/auth?org_id={org}
//
// Generic OAuth start handler. Validates the connector type, ensures the
// org_id is supplied, marks (or creates) the pathfinder.connectors row
// with status='pending', issues a signed state token (SPEC § 5.3), and
// 302-redirects the browser to the provider's authorize URL.
//
// The redirect_uri is computed from the request URL's origin so we don't
// need a hard-coded prod URL — local dev, Vercel preview, and prod all
// "just work" because the value is captured into the state and the
// callback uses the same scheme.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/connectors/audit';
import { issueState } from '@/lib/connectors/oauth-state';
import { buildAuthorizeUrl, getProvider, isConnectorType } from '@/lib/connectors/providers';
import type { ConnectorType } from '@/lib/connectors/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { type: string } }) {
  const typeParam = params.type.toLowerCase();
  if (!isConnectorType(typeParam)) {
    return NextResponse.json(
      { error: 'unknown_connector_type', allowed: ['slack', 'teams', 'hubspot'] },
      { status: 400 },
    );
  }
  const type: ConnectorType = typeParam;

  const url = new URL(req.url);
  const orgId = url.searchParams.get('org_id');
  if (!orgId) {
    return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
  }

  // Provider config — throws if env client_id is missing.
  let authorizeUrl: string;
  let connectorId: string;
  try {
    getProvider(type);
    // Upsert connector row to status='pending'. If a row already exists
    // for this (org, type) and was 'connected', we keep it 'connected'
    // and just update updated_at — the user might be re-authing to
    // refresh scopes, in which case the callback will rewrite status.
    connectorId = await upsertPendingConnector(orgId, type);

    const redirectUri = `${url.origin}/api/connectors/${type}/callback`;
    const state = issueState({ org_id: orgId, connector_type: type });
    authorizeUrl = buildAuthorizeUrl(type, state, redirectUri);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Audit the OAuth start. Fail-open per recordAudit's contract.
  await recordAudit({
    connector_id: connectorId,
    customer_org_id: orgId,
    event_type: 'oauth.start',
    direction: 'oauth',
    status: 'sent',
    payload_summary: { connector_type: type },
  });

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}

interface ConnectorIdRow {
  id: string;
}

async function upsertPendingConnector(orgId: string, type: ConnectorType): Promise<string> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      upsert: (
        rows: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{
            data: ConnectorIdRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const res = await sb
    .from('connectors')
    .upsert(
      {
        customer_org_id: orgId,
        connector_type: type,
        status: 'pending',
      },
      { onConflict: 'customer_org_id,connector_type' },
    )
    .select('id')
    .maybeSingle();
  if (res.error || !res.data) {
    throw new Error(`upsert connector failed: ${res.error?.message ?? 'no row returned'}`);
  }
  return res.data.id;
}
