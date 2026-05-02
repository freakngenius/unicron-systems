// lib/connectors/providers.ts — per-connector OAuth + scope metadata.
//
// SPEC § 5.4 scope minimization: for v1 we request the minimum scopes
// each connector needs to do its Phase-1 job (outbound posts + inbound
// commands for Slack/Teams; deal/contact read+write for HubSpot). Read-
// only scope sets are commented for the future "audit-mode" customers.
//
// The `tokenExchange` URL is the provider's OAuth2 token endpoint; only
// Slack's is exercised in C-1A — Teams/HubSpot return 501 in the
// callback route until C-2 / Phase 3.

import type { ConnectorType } from './types';

export interface ProviderConfig {
  /** Pretty name for audit logs and error messages. */
  displayName: string;
  /** OAuth2 authorize URL (browser redirect target). */
  authorizeUrl: string;
  /** OAuth2 token endpoint (server-side POST in callback). */
  tokenExchangeUrl: string;
  /** Phase 1 scopes per SPEC § 5.4. Joined with the provider's separator. */
  scopes: string[];
  /** Provider-specific scope separator: Slack uses ',', MS uses ' ', HubSpot uses ' '. */
  scopeSeparator: string;
  /** Whether C-1A's callback is allowed to actually exchange the code. */
  exchangeImplemented: boolean;
}

const PROVIDERS: Record<ConnectorType, ProviderConfig> = {
  slack: {
    displayName: 'Slack',
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenExchangeUrl: 'https://slack.com/api/oauth.v2.access',
    // SPEC § 5.4: chat:write + channels:read + im:write + app_mentions:read.
    // commands is needed for slash command registration which C-1B handles.
    scopes: ['chat:write', 'channels:read', 'im:write', 'app_mentions:read', 'commands', 'reactions:read'],
    scopeSeparator: ',',
    exchangeImplemented: true,
  },
  teams: {
    displayName: 'Microsoft Teams',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenExchangeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    // SPEC § 2.2 Step B: User.Read + ChannelMessage.Send + Chat.ReadWrite +
    // Team.ReadBasic.All + Channel.ReadBasic.All. Plus offline_access for
    // the refresh token.
    scopes: [
      'User.Read',
      'ChannelMessage.Send',
      'Chat.ReadWrite',
      'Team.ReadBasic.All',
      'Channel.ReadBasic.All',
      'offline_access',
    ],
    scopeSeparator: ' ',
    exchangeImplemented: false,
  },
  hubspot: {
    displayName: 'HubSpot',
    authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenExchangeUrl: 'https://api.hubapi.com/oauth/v1/token',
    // SPEC § 5.4: deal/contact read+write + schemas.deals.read for stage
    // mapping discovery.
    scopes: [
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.schemas.deals.read',
    ],
    scopeSeparator: ' ',
    exchangeImplemented: false,
  },
};

export function getProvider(type: ConnectorType): ProviderConfig {
  const cfg = PROVIDERS[type];
  if (!cfg) throw new Error(`unknown connector type: ${type}`);
  return cfg;
}

/** Validate the URL `[type]` segment matches a known provider. */
export function isConnectorType(value: string): value is ConnectorType {
  return value === 'slack' || value === 'teams' || value === 'hubspot';
}

/** Build the provider's authorize URL with state, redirect_uri, scopes,
 *  and the per-provider client_id (read from env). Caller is responsible
 *  for env validation; missing client_id throws. */
export function buildAuthorizeUrl(
  type: ConnectorType,
  state: string,
  redirectUri: string,
): string {
  const cfg = getProvider(type);
  const params = new URLSearchParams();

  if (type === 'slack') {
    const clientId = process.env.SLACK_CLIENT_ID;
    if (!clientId) throw new Error('SLACK_CLIENT_ID is not set');
    params.set('client_id', clientId);
    params.set('scope', cfg.scopes.join(cfg.scopeSeparator));
    params.set('redirect_uri', redirectUri);
    params.set('state', state);
  } else if (type === 'teams') {
    const clientId = process.env.TEAMS_APP_ID;
    if (!clientId) throw new Error('TEAMS_APP_ID is not set');
    params.set('client_id', clientId);
    params.set('response_type', 'code');
    params.set('redirect_uri', redirectUri);
    params.set('scope', cfg.scopes.join(cfg.scopeSeparator));
    params.set('state', state);
    params.set('response_mode', 'query');
  } else if (type === 'hubspot') {
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    if (!clientId) throw new Error('HUBSPOT_CLIENT_ID is not set');
    params.set('client_id', clientId);
    params.set('redirect_uri', redirectUri);
    params.set('scope', cfg.scopes.join(cfg.scopeSeparator));
    params.set('state', state);
  }

  return `${cfg.authorizeUrl}?${params.toString()}`;
}
