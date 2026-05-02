// lib/email/oauth.ts — Stream B Gate B2.
//
// OAuth 2.0 authorization-code flow for Gmail (Google) and Outlook
// (Microsoft Graph). Mirrors the lib/slack/install.ts pattern:
//
//   GET /api/email/oauth/start?provider=gmail&actor=rep@zedcor.com
//     → buildAuthorizeUrl() → 302 to provider's authorize endpoint
//   GET /api/email/oauth/callback?code=...&state=...
//     → completeOauth() → upsert pathfinder.email_integrations row
//
// State token is HMAC-signed; the signed payload encodes (provider,
// actor_email, nonce). Without this, the callback can't know which
// operator the redirect belongs to. CRON_SECRET is the HMAC key (same
// pattern as lib/slack/install.ts).
//
// Token storage is sensitive — supabaseAdmin only. RLS denies anon
// reads on email_integrations entirely.

import crypto from 'node:crypto';

import { publicUrl } from '@/lib/public-url';
import { supabaseAdmin } from '@/lib/supabase';
import type { EmailIntegration, EmailProvider } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Provider config — single source of truth for endpoint URLs + scopes.
// ────────────────────────────────────────────────────────────────────────

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: readonly string[];
  // The redirect URI registered with the provider. Must match exactly.
  redirectPath: string;
  envClientIdName: string;
  envClientSecretName: string;
}

export const PROVIDER_CONFIGS: Record<EmailProvider, ProviderConfig> = {
  gmail: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    redirectPath: '/api/email/oauth/callback',
    envClientIdName: 'GOOGLE_OAUTH_CLIENT_ID',
    envClientSecretName: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },
  outlook: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['https://graph.microsoft.com/Mail.Send', 'offline_access', 'User.Read'],
    redirectPath: '/api/email/oauth/callback',
    envClientIdName: 'MICROSOFT_GRAPH_CLIENT_ID',
    envClientSecretName: 'MICROSOFT_GRAPH_CLIENT_SECRET',
  },
};

export function isEmailProvider(value: unknown): value is EmailProvider {
  return value === 'gmail' || value === 'outlook';
}

// ────────────────────────────────────────────────────────────────────────
// State token — HMAC-signed { provider, actor, nonce }
// ────────────────────────────────────────────────────────────────────────

const STATE_RANDOM_BYTES = 24;

function stateSecret(): string {
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error('CRON_SECRET is not set; cannot sign email OAuth state');
  return s;
}

interface StatePayload {
  provider: EmailProvider;
  actor: string;
  nonce: string;
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function buildState(provider: EmailProvider, actorEmail: string): string {
  const payload: StatePayload = {
    provider,
    actor: actorEmail,
    nonce: crypto.randomBytes(STATE_RANDOM_BYTES).toString('hex'),
  };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', stateSecret()).update(encoded, 'utf8').digest('hex');
  return `${encoded}.${sig}`;
}

export function verifyState(
  state: string | null | undefined,
): StatePayload | null {
  if (!state || typeof state !== 'string') return null;
  const dot = state.indexOf('.');
  if (dot <= 0) return null;
  const encoded = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto
    .createHmac('sha256', stateSecret())
    .update(encoded, 'utf8')
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(encoded)) as StatePayload;
    if (!isEmailProvider(payload.provider)) return null;
    if (typeof payload.actor !== 'string' || !payload.actor) return null;
    return payload;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// buildAuthorizeUrl — operator hits this from /api/email/oauth/start
// ────────────────────────────────────────────────────────────────────────

export interface BuildAuthorizeUrlResult {
  url: string;
  state: string;
}

export function buildAuthorizeUrl(args: {
  provider: EmailProvider;
  actorEmail: string;
}): BuildAuthorizeUrlResult {
  const cfg = PROVIDER_CONFIGS[args.provider];
  const clientId = process.env[cfg.envClientIdName];
  if (!clientId) {
    throw new Error(`${cfg.envClientIdName} is not set; ${args.provider} OAuth disabled`);
  }
  const state = buildState(args.provider, args.actorEmail);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${publicUrl()}${cfg.redirectPath}`,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    state,
    access_type: 'offline', // Google: ask for refresh_token
    prompt: 'consent', // Force refresh_token issuance on re-auth
  });
  return { url: `${cfg.authorizeUrl}?${params.toString()}`, state };
}

// ────────────────────────────────────────────────────────────────────────
// exchangeCode — POST to provider's token endpoint
// ────────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number; // seconds
  scope: string | null;
  id_token: string | null;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(args: {
  provider: EmailProvider;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenResponse> {
  const cfg = PROVIDER_CONFIGS[args.provider];
  const clientId = process.env[cfg.envClientIdName];
  const clientSecret = process.env[cfg.envClientSecretName];
  if (!clientId || !clientSecret) {
    throw new Error(
      `${cfg.envClientIdName} / ${cfg.envClientSecretName} not configured`,
    );
  }

  const body = new URLSearchParams({
    code: args.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `${publicUrl()}${cfg.redirectPath}`,
    grant_type: 'authorization_code',
  });

  const f = args.fetchImpl ?? fetch;
  const res = await f(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as RawTokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(
      `oauth_token_exchange_failed: ${args.provider} status=${res.status} error=${
        json.error ?? 'unknown'
      }${json.error_description ? ` (${json.error_description})` : ''}`,
    );
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    token_type: json.token_type ?? 'Bearer',
    expires_in: typeof json.expires_in === 'number' ? json.expires_in : 3600,
    scope: json.scope ?? null,
    id_token: json.id_token ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────────
// resolveAccountEmail — fetch the connected mailbox's address
// ────────────────────────────────────────────────────────────────────────

export async function resolveAccountEmail(args: {
  provider: EmailProvider;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const f = args.fetchImpl ?? fetch;
  try {
    if (args.provider === 'gmail') {
      const res = await f('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { authorization: `Bearer ${args.accessToken}` },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { emailAddress?: string };
      return json.emailAddress ?? null;
    }
    if (args.provider === 'outlook') {
      const res = await f('https://graph.microsoft.com/v1.0/me', {
        headers: { authorization: `Bearer ${args.accessToken}` },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { mail?: string; userPrincipalName?: string };
      return json.mail ?? json.userPrincipalName ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// persistIntegration — upsert email_integrations row
// ────────────────────────────────────────────────────────────────────────

export async function persistIntegration(args: {
  actorEmail: string;
  provider: EmailProvider;
  accountEmail: string;
  tokens: TokenResponse;
}): Promise<EmailIntegration> {
  const admin = supabaseAdmin();
  const expiresAt = new Date(Date.now() + args.tokens.expires_in * 1000).toISOString();

  const upsertRow: Record<string, unknown> = {
    actor_email: args.actorEmail,
    provider: args.provider,
    account_email: args.accountEmail,
    access_token: args.tokens.access_token,
    refresh_token: args.tokens.refresh_token,
    token_expires_at: expiresAt,
    scope: args.tokens.scope,
    provider_meta: {},
    connected_at: new Date().toISOString(),
    disconnected_at: null,
  };

  const { data, error } = await (admin.from('email_integrations') as unknown as {
    upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => {
      select: () => {
        single: () => Promise<{ data: EmailIntegration | null; error: { message: string } | null }>;
      };
    };
  })
    .upsert(upsertRow, { onConflict: 'actor_email,provider,account_email' })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`persistIntegration: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}

// ────────────────────────────────────────────────────────────────────────
// completeOauth — full callback flow
// ────────────────────────────────────────────────────────────────────────

export interface CompleteOauthResult {
  integration: EmailIntegration;
  reused: boolean;
}

export async function completeOauth(args: {
  code: string;
  state: string | null | undefined;
  fetchImpl?: typeof fetch;
}): Promise<CompleteOauthResult> {
  const payload = verifyState(args.state);
  if (!payload) {
    throw new Error('invalid_state');
  }

  const tokens = await exchangeCode({
    provider: payload.provider,
    code: args.code,
    fetchImpl: args.fetchImpl,
  });

  const accountEmail = await resolveAccountEmail({
    provider: payload.provider,
    accessToken: tokens.access_token,
    fetchImpl: args.fetchImpl,
  });

  if (!accountEmail) {
    throw new Error('cannot_resolve_account_email');
  }

  const integration = await persistIntegration({
    actorEmail: payload.actor,
    provider: payload.provider,
    accountEmail,
    tokens,
  });

  return { integration, reused: Boolean(integration.disconnected_at === null) };
}
