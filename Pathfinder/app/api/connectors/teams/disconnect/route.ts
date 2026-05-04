// POST /pathfinder/api/connectors/teams/disconnect
//
// Gate 14A. Revokes the active Microsoft Teams connection for the
// current user. Best-effort revoke at Microsoft Graph's
// /me/revokeSignInSessions, then mark the local row status='revoked'
// regardless of provider response — local state is what we control and
// the user expects the tile to flip immediately.

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId } from '@/lib/connectors/auth';
import {
  getTeamsConnectionTokens,
  markTeamsConnectionRevoked,
  revokeTeamsTokenAtProvider,
} from '@/lib/connectors/user-connection';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'operator email required' },
      { status: 403 },
    );
  }

  let providerRevoked: boolean = false;
  let tenantId: string | undefined;
  try {
    const tokens = await getTeamsConnectionTokens(userId);
    if (!tokens) {
      // No active connection — idempotent success.
      return NextResponse.json({ ok: true, already_disconnected: true });
    }
    tenantId = tokens.connection.tenant_id ?? undefined;
    // Microsoft Graph's revoke endpoint takes the user's access token
    // (not the refresh token) — call before we mark local revoked so
    // the access token is still valid.
    providerRevoked = await revokeTeamsTokenAtProvider(tokens.access);
  } catch (err) {
    // Decryption failure or DB error — still try to mark local row
    // revoked so the tile state isn't stuck CONNECTED.
    const message = err instanceof Error ? err.message : String(err);
    try {
      await markTeamsConnectionRevoked(userId, tenantId);
    } catch {
      // swallow — we'll surface the original error
    }
    return NextResponse.json({ error: 'disconnect_partial', detail: message }, { status: 500 });
  }

  try {
    await markTeamsConnectionRevoked(userId, tenantId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'local_revoke_failed', detail: message, provider_revoked: providerRevoked },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, provider_revoked: providerRevoked });
}
