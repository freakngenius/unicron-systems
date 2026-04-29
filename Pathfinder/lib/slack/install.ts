// lib/slack/install.ts — Slack OAuth v2 install flow.
//
// Two route entry points consume this module:
//
//   GET /api/slack/install/start    → buildInstallUrl() → 302 to slack.com
//   GET /api/slack/install/callback → completeInstall(code, state) → upsert
//
// The state token is an HMAC-signed nonce (random + signature, joined by '.').
// We don't encode any data in it; its job is to prove the callback came from
// an install we initiated, not a forged URL someone spammed at the callback.
//
// The bot scope list is the single source of truth for the OAuth grant.
// `docs/SLACK-APP-SETUP.md` § 3b mirrors it for the Slack-app config; if you
// add a scope here, mirror it there.

import crypto from 'node:crypto';

import { supabaseAdmin } from '@/lib/supabase';
import { publicUrl } from '@/lib/public-url';
import { auditSlack } from '@/lib/slack/bot';
import type { SlackWorkspace } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Bot scopes — kept in sync with docs/SLACK-APP-SETUP.md § 3b
// ────────────────────────────────────────────────────────────────────────

export const BOT_SCOPES = [
  'chat:write',
  'chat:write.public',
  'commands',
  'users:read',
  'users:read.email',
  'im:write',
  'views:write',
  'team:read',
] as const;

// ────────────────────────────────────────────────────────────────────────
// State token — HMAC-signed random nonce
// ────────────────────────────────────────────────────────────────────────

const STATE_RANDOM_BYTES = 24;

function stateSecret(): string {
  // CRON_SECRET is already required across the app for Vercel cron auth and
  // serves as a generic operator-only secret here. If we later need to
  // separate concerns we can introduce SLACK_STATE_SECRET; for v1 this
  // keeps the env surface small.
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error('CRON_SECRET is not set; cannot sign Slack OAuth state');
  return s;
}

export function buildState(): string {
  const nonce = crypto.randomBytes(STATE_RANDOM_BYTES).toString('hex');
  const sig = crypto.createHmac('sha256', stateSecret()).update(nonce, 'utf8').digest('hex');
  return `${nonce}.${sig}`;
}

export function verifyState(state: string | null | undefined): boolean {
  if (!state || typeof state !== 'string') return false;
  const dot = state.indexOf('.');
  if (dot <= 0) return false;
  const nonce = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto.createHmac('sha256', stateSecret()).update(nonce, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ────────────────────────────────────────────────────────────────────────
// buildInstallUrl — operator hits this from /api/slack/install/start
// ────────────────────────────────────────────────────────────────────────

export interface BuildInstallUrlResult {
  url: string;
  state: string;
}

export function buildInstallUrl(): BuildInstallUrlResult {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new Error('SLACK_CLIENT_ID is not set');

  const state = buildState();
  const params = new URLSearchParams({
    client_id: clientId,
    scope: BOT_SCOPES.join(','),
    redirect_uri: `${publicUrl()}/api/slack/install/callback`,
    state,
  });
  return {
    url: `https://slack.com/oauth/v2/authorize?${params.toString()}`,
    state,
  };
}

// ────────────────────────────────────────────────────────────────────────
// exchangeCode — POST to oauth.v2.access
// ────────────────────────────────────────────────────────────────────────

interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  app_id?: string;
  authed_user?: { id?: string };
  scope?: string;
  token_type?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
  enterprise?: { id?: string; name?: string } | null;
  is_enterprise_install?: boolean;
}

export async function exchangeCode(code: string): Promise<SlackOAuthV2Response> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not configured');
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `${publicUrl()}/api/slack/install/callback`,
  });

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  // Slack returns 200 with `ok: false` on failure; we treat both transport
  // errors and ok=false as throw-worthy so the route can map to a clear
  // 5xx for the operator.
  const json = (await res.json()) as SlackOAuthV2Response;
  if (!res.ok || !json.ok) {
    throw new Error(`oauth.v2.access failed: status=${res.status} error=${json.error ?? 'unknown'}`);
  }
  return json;
}

// ────────────────────────────────────────────────────────────────────────
// resolveInstallerEmail — best-effort lookup for the install row
// ────────────────────────────────────────────────────────────────────────

async function resolveInstallerEmail(
  botToken: string,
  userId: string | undefined,
): Promise<string | null> {
  if (!userId) return null;
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${botToken}` },
    });
    const json = (await res.json()) as {
      ok: boolean;
      user?: { profile?: { email?: string } };
    };
    return json.user?.profile?.email ?? null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// completeInstall — the full callback flow
// ────────────────────────────────────────────────────────────────────────

export interface CompleteInstallResult {
  workspace: SlackWorkspace;
  reused: boolean; // true when the team_id existed already (re-install)
}

export async function completeInstall(args: {
  code: string;
  state: string | null | undefined;
}): Promise<CompleteInstallResult> {
  if (!verifyState(args.state)) {
    await auditSlack('install_state_invalid', {
      message: 'Slack install callback failed state verification',
    });
    throw new Error('invalid_state');
  }

  const oauth = await exchangeCode(args.code);
  const teamId = oauth.team?.id;
  const teamName = oauth.team?.name;
  const botToken = oauth.access_token;
  const botUserId = oauth.bot_user_id;
  const appId = oauth.app_id;
  const scope = oauth.scope;
  const installerUserId = oauth.authed_user?.id;

  if (!teamId || !teamName || !botToken || !botUserId || !appId || !scope) {
    await auditSlack('install_payload_incomplete', {
      message: 'oauth.v2.access response missing required fields',
      team_id_present: Boolean(teamId),
      bot_token_present: Boolean(botToken),
    });
    throw new Error('install_payload_incomplete');
  }

  const installerEmail = await resolveInstallerEmail(botToken, installerUserId);

  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => {
        select: (cols: string) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      };
    };
  };

  const existing = await sb.from('slack_workspaces').select('team_id').eq('team_id', teamId).maybeSingle();

  const upsertRes = await sb
    .from('slack_workspaces')
    .upsert(
      {
        team_id: teamId,
        team_name: teamName,
        bot_user_id: botUserId,
        bot_token: botToken,
        app_id: appId,
        scope,
        installer_user_id: installerUserId ?? null,
        installer_email: installerEmail,
        installed_at: new Date().toISOString(),
        uninstalled_at: null,
        raw_oauth_payload: oauth as unknown as Record<string, unknown>,
      },
      { onConflict: 'team_id' },
    )
    .select('*');

  if (upsertRes.error || !upsertRes.data || upsertRes.data.length === 0) {
    await auditSlack('install_persist_failed', {
      message: 'slack_workspaces upsert failed',
      team_id: teamId,
      reason: upsertRes.error?.message ?? 'no_row_returned',
    });
    throw new Error(`install persist failed: ${upsertRes.error?.message ?? 'no row returned'}`);
  }

  const workspace = upsertRes.data[0] as unknown as SlackWorkspace;
  const reused = Boolean(existing.data);

  await auditSlack(reused ? 'install_reused' : 'install_completed', {
    message: reused ? 'workspace re-installed; token rotated' : 'workspace installed',
    team_id: teamId,
    team_name: teamName,
    installer_email: installerEmail,
  });

  return { workspace, reused };
}

// ────────────────────────────────────────────────────────────────────────
// markUninstalled — flip uninstalled_at when Slack sends app_uninstalled
// ────────────────────────────────────────────────────────────────────────

export async function markUninstalled(teamId: string): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  await sb
    .from('slack_workspaces')
    .update({ uninstalled_at: new Date().toISOString() })
    .eq('team_id', teamId);

  await auditSlack('app_uninstalled', {
    message: 'workspace marked uninstalled',
    team_id: teamId,
  });
}
