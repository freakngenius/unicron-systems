// lib/outreach/user-connection.ts — Demo Polish UX Gate 9D.
//
// Resolves the active (per-user) email connection for the v2 outreach
// composer. Spec: SPEC - Lead Detail Page v2.md § "Connected-account
// Send model". Reads `pathfinder.user_connections` first; falls back
// to `pathfinder.email_integrations` (the legacy table that already
// stores Kyle's Gmail OAuth tokens) so the demo works without a
// Settings page UI.
//
// Demo decision: the `oauth_token_enc` bytea on user_connections is
// allowed to be null in 0113. Settings UI in Gate 9.5 backfills real
// tokens. Until then, the resolved connection's "active" boolean +
// provider + email are surfaced for display, while the actual provider
// send still draws its OAuth token from the legacy email_integrations
// row keyed on the same email.

import { supabase } from '@/lib/supabase';

export interface ResolvedConnection {
  user_id: string;
  provider: 'gmail' | 'outlook';
  email: string;
  /** Whether a usable OAuth token exists somewhere (user_connections or
   *  email_integrations). The composer disables Send when false. */
  isConnected: boolean;
}

interface UserConnectionRow {
  user_id: string;
  provider: 'gmail' | 'outlook';
  email: string;
  status: 'active' | 'expired' | 'revoked';
  connected_at: string;
}

interface EmailIntegrationRow {
  actor_email: string;
  account_email: string;
  provider: 'gmail' | 'outlook';
  access_token: string | null;
  disconnected_at: string | null;
}

/**
 * Resolve the connection for a given operator (keyed by their email).
 * Prefers the most recent active row in user_connections; falls back to
 * the matching active row in email_integrations.
 */
export async function resolveActiveConnection(
  userIdOrEmail: string,
): Promise<ResolvedConnection | null> {
  const { data: ucRows } = await supabase
    .from('user_connections')
    .select('*')
    .eq('user_id', userIdOrEmail)
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1);
  const uc = (ucRows ?? [])[0] as UserConnectionRow | undefined;

  if (uc) {
    // Verify a usable token exists somewhere — email_integrations is the
    // source of truth for tokens during the 9D demo window.
    const { data: tokRow } = await supabase
      .from('email_integrations')
      .select('actor_email, account_email, provider, access_token, disconnected_at')
      .eq('actor_email', userIdOrEmail)
      .eq('provider', uc.provider)
      .is('disconnected_at', null)
      .maybeSingle();
    const tok = tokRow as EmailIntegrationRow | null;
    return {
      user_id: uc.user_id,
      provider: uc.provider,
      email: uc.email,
      isConnected: Boolean(tok?.access_token),
    };
  }

  // Fallback: synthesize a connection from the legacy table.
  const { data: legacyRow } = await supabase
    .from('email_integrations')
    .select('actor_email, account_email, provider, access_token, disconnected_at')
    .eq('actor_email', userIdOrEmail)
    .is('disconnected_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const legacy = legacyRow as EmailIntegrationRow | null;
  if (!legacy) return null;
  return {
    user_id: userIdOrEmail,
    provider: legacy.provider,
    email: legacy.account_email,
    isConnected: Boolean(legacy.access_token),
  };
}

/** Format the connection as the "From" display string per spec § 7. */
export function formatFromDisplay(conn: ResolvedConnection | null): string {
  if (!conn) return 'Not connected';
  const providerLabel = conn.provider === 'gmail' ? 'Gmail' : 'Outlook';
  return `${conn.email} via ${providerLabel}`;
}
