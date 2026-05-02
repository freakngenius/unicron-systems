// POST /pathfinder/api/connectors/[connectorId]/disconnect
//
// 1. Calls the provider's revoke endpoint (Slack `auth.revoke`; Teams +
//    HubSpot stubbed for v1)
// 2. Soft-deletes connector_tokens (revoked_at = now())
// 3. Sets connector status='revoked' + disconnected_at=now()
// 4. Writes a connector_audit_log row (direction='oauth', status='succeeded'
//    on revoke success or 'failed' if the provider call errored — we
//    still flip local state because the operator's intent is clear)
//
// SECURITY: provider revoke is best-effort. A failed revoke does NOT
// block the local soft-delete because token rotation already invalidates
// the cached plaintext, and the next dispatcher call will refuse to fire
// on status='revoked'. The audit log captures the failure for follow-up.

import { NextResponse, type NextRequest } from 'next/server';

import { isOperatorRequest, resolveOrgId } from '@/lib/connectors/auth';
import { getConnectorById } from '@/lib/connectors/queries';
import { getToken } from '@/lib/connectors/tokens';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: { connectorId: string };
}

interface ProviderRevokeResult {
  ok: boolean;
  error?: string;
}

async function revokeSlack(accessToken: string): Promise<ProviderRevokeResult> {
  // Slack's auth.revoke endpoint — POST with the token in the
  // Authorization header. We don't pass `?test=true` because we want a
  // real revoke; if the call fails we still continue with local
  // soft-delete (see SECURITY note above).
  try {
    const res = await fetch('https://slack.com/api/auth.revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || json.ok !== true) {
      return { ok: false, error: json.error ?? `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isOperatorRequest(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const connector = await getConnectorById(params.connectorId);
  if (!connector) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const orgId = resolveOrgId(req);
  if (connector.customer_org_id !== orgId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = supabaseAdmin();

  // Best-effort provider revoke. We need the plaintext token. C-1A's
  // tokens.ts exports getToken(connectorId) which returns the decrypted
  // ConnectorTokenPayload (or null if the active token row is missing);
  // we only need the .access string for Slack auth.revoke.
  let providerResult: ProviderRevokeResult = { ok: true };
  let providerCalled = false;
  if (connector.connector_type === 'slack') {
    try {
      const tokenPayload = await getToken(connector.id);
      const accessToken = tokenPayload?.access ?? null;
      if (accessToken) {
        providerCalled = true;
        providerResult = await revokeSlack(accessToken);
      } else {
        // No active token row — already revoked, or the install never
        // completed. Local soft-delete is still the right action; the
        // audit log captures the no-token-found state.
        providerResult = { ok: false, error: 'no_active_token' };
      }
    } catch (err) {
      providerResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Soft-delete tokens regardless of provider revoke outcome. The
  // connector_tokens table is service-role-only (not in the typed schema
  // bag) so we cast to `any` for this single call. A typed client lands
  // when C-1A's lib/connectors/tokens.ts wraps it.
  await (admin as any)
    .from('connector_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('connector_id', connector.id)
    .is('revoked_at', null);

  const { error: updErr } = await (admin.from('connectors') as any)
    .update({
      status: 'revoked',
      disconnected_at: new Date().toISOString(),
    })
    .eq('id', connector.id);
  if (updErr) {
    return NextResponse.json(
      { error: 'update_failed', message: updErr.message },
      { status: 500 },
    );
  }

  await (admin.from('connector_audit_log') as any).insert({
    connector_id: connector.id,
    customer_org_id: orgId,
    event_type: 'disconnect',
    direction: 'oauth',
    status: providerResult.ok ? 'succeeded' : 'failed',
    payload_summary: {
      provider_called: providerCalled,
      connector_type: connector.connector_type,
    },
    error_message: providerResult.ok ? null : providerResult.error ?? null,
  });

  return NextResponse.json({
    ok: true,
    provider_revoked: providerResult.ok,
    provider_called: providerCalled,
    error: providerResult.ok ? null : providerResult.error,
  });
}
