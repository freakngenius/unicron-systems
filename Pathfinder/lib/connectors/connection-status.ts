// lib/connectors/connection-status.ts — single source of truth for
// "is HubSpot connected for user X" across surfaces.
//
// Three surfaces consume this today:
//  1. Settings tile (Connectors page) → /api/connectors/hubspot/status
//  2. Chat agent (Gate 22) → buildSonarSystemPrompt's HUBSPOT block
//  3. Lead detail Push → uses getHubspotConnectionTokens directly because
//     it also needs the decrypted access token; that path delegates the
//     "is connected" question to this helper so all three reads agree.
//
// Multi-tenant safety: every read filters by user_id (the same value that
// install/callback wrote). Token columns are never selected.
//
// `userId` is the same string written into pathfinder.user_connections
// at install time — the operator email today, since
// lib/connectors/auth.getCurrentUserId() resolves to the operator
// allowlist email. Callers MUST resolve the right identity before
// calling this helper (a chat session whose basic-auth email differs
// from the operator email will not match the install row).

import { getActiveHubspotConnection } from '@/lib/connectors/user-connection';

export interface HubspotConnectionStatus {
  /** True iff there is an active row AND the access token is not past
   *  its `expires_at` timestamp. Settings + chat both use this as the
   *  "should I render Connected?" signal. */
  connected: boolean;
  /** True iff there is an active row but expires_at is in the past.
   *  Surfaces a "Reconnect" affordance rather than "Connect". */
  expired: boolean;
  status: 'active' | 'expired' | 'revoked' | 'none';
  portalId: string | null;
  portalName: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
}

const NOT_CONNECTED: HubspotConnectionStatus = {
  connected: false,
  expired: false,
  status: 'none',
  portalId: null,
  portalName: null,
  connectedAt: null,
  expiresAt: null,
};

/** Returns a uniform connection-status snapshot for the given user. Never
 *  throws on "no row" — only on the underlying DB error path, which the
 *  caller can let propagate or catch as desired. */
export async function getHubspotConnectionStatus(
  userId: string | null,
): Promise<HubspotConnectionStatus> {
  if (!userId) return NOT_CONNECTED;
  const conn = await getActiveHubspotConnection(userId);
  if (!conn) return NOT_CONNECTED;

  const expiresAtMs = conn.expires_at ? Date.parse(conn.expires_at) : null;
  const expired = expiresAtMs !== null && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();

  return {
    connected: !expired,
    expired,
    status: expired ? 'expired' : (conn.status as 'active' | 'expired' | 'revoked'),
    portalId: conn.portal_id,
    portalName: conn.portal_name,
    connectedAt: conn.connected_at,
    expiresAt: conn.expires_at,
  };
}
