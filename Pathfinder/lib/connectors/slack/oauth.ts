// lib/connectors/slack/oauth.ts — Slack OAuth v2 token exchange.
//
// We use the framework-namespaced redirect URI
// `/api/connectors/slack/callback` (distinct from the existing
// `/api/slack/install/callback` which keeps powering the Phase-1 alerts
// install path). Both live side by side until the slack_workspaces table
// is migrated into pathfinder.connectors in C-1F.

import { publicUrl } from '@/lib/public-url';
import { getProvider } from '@/lib/connectors/providers';

// Local view of the Slack provider config in the shape this file expects
// (env-var names + user-scope split + tokenUrl alias). Layered on top of
// the canonical `getProvider('slack')` from C-1A so the underlying
// scope-list + authorize URL stay single-sourced.
const SLACK_PROVIDER = {
  clientIdEnv: 'SLACK_CLIENT_ID' as const,
  clientSecretEnv: 'SLACK_CLIENT_SECRET' as const,
  authorizeUrl: getProvider('slack').authorizeUrl,
  tokenUrl: getProvider('slack').tokenExchangeUrl,
  scopes: getProvider('slack').scopes,
  // C-1A's provider config is bot-only for Phase 1; user_scope stays
  // empty until per-rep DM threading ships in Phase 2 (see SPEC § 4.1).
  userScopes: [] as string[],
};

export interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  app_id?: string;
  authed_user?: { id?: string; access_token?: string; scope?: string };
  scope?: string;
  token_type?: string;
  /** Bot token (xoxb-…). Used for chat.postMessage and channel reads. */
  access_token?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
  enterprise?: { id?: string; name?: string } | null;
  is_enterprise_install?: boolean;
}

export function callbackUrl(): string {
  return `${publicUrl()}/api/connectors/slack/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env[SLACK_PROVIDER.clientIdEnv];
  if (!clientId) {
    throw new Error(`${SLACK_PROVIDER.clientIdEnv} is not set; cannot build Slack authorize URL`);
  }
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_PROVIDER.scopes.join(','),
    user_scope: SLACK_PROVIDER.userScopes.join(','),
    redirect_uri: callbackUrl(),
    state,
  });
  return `${SLACK_PROVIDER.authorizeUrl}?${params.toString()}`;
}

/**
 * Exchange an OAuth code for a Slack bot token via oauth.v2.access.
 * Throws on transport error or `ok: false`. The route handler maps the
 * thrown error onto a connector audit row.
 */
export async function exchangeCode(code: string): Promise<SlackOAuthV2Response> {
  const clientId = process.env[SLACK_PROVIDER.clientIdEnv];
  const clientSecret = process.env[SLACK_PROVIDER.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error('SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not configured');
  }
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUrl(),
  });

  const res = await fetch(SLACK_PROVIDER.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as SlackOAuthV2Response;
  if (!res.ok || !json.ok) {
    throw new Error(`oauth.v2.access failed: status=${res.status} error=${json.error ?? 'unknown'}`);
  }
  return json;
}
