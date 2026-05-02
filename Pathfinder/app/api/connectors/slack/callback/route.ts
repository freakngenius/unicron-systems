// GET /api/connectors/slack/callback?code=…&state=…
//
// OAuth callback. Slack hits this directly so the path is exempted from
// basic-auth in middleware.ts. Steps:
//
//   1. Verify state token (signed, fresh, type='slack')
//   2. Exchange code via oauth.v2.access
//   3. Upsert the connectors row with account_name = team.name and
//      account_external_id = team.id
//   4. Store the bot access_token via storeToken (encrypted at rest)
//   5. Audit + redirect back to Settings with a success flag

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/connectors/audit';
import { markConnectorError, upsertConnector } from '@/lib/connectors/registry';
import { exchangeCode } from '@/lib/connectors/slack/oauth';
import { verifyState } from '@/lib/connectors/state';
import { storeToken } from '@/lib/connectors/tokens';
import { publicUrl } from '@/lib/public-url';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function settingsUrl(qs: string): string {
  return `${publicUrl()}/settings/connectors?${qs}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    // User clicked Cancel in Slack's auth screen. Redirect with a flag.
    return NextResponse.redirect(
      settingsUrl(`slack=cancelled&reason=${encodeURIComponent(errorParam)}`),
      { status: 302 },
    );
  }

  if (!code) {
    return NextResponse.json({ ok: false, error: 'missing code' }, { status: 400 });
  }

  const verified = verifyState(state, 'slack');
  if (!verified.ok || !verified.orgId) {
    return NextResponse.json(
      { ok: false, error: `invalid state: ${verified.reason}` },
      { status: 400 },
    );
  }
  const orgId = verified.orgId;

  let oauth;
  try {
    oauth = await exchangeCode(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // No connector row to attach the audit to yet — log via console; the
    // user-facing redirect carries the error so they can retry.
    // eslint-disable-next-line no-console
    console.warn('[connectors/slack/callback] exchangeCode failed:', message);
    return NextResponse.redirect(settingsUrl(`slack=error&reason=${encodeURIComponent(message)}`), {
      status: 302,
    });
  }

  const teamId = oauth.team?.id;
  const teamName = oauth.team?.name ?? 'Slack workspace';
  const accessToken = oauth.access_token;

  if (!teamId || !accessToken) {
    return NextResponse.redirect(settingsUrl('slack=error&reason=incomplete_payload'), {
      status: 302,
    });
  }

  // Upsert connectors row (status=pending) and stamp account info.
  const connector = await upsertConnector({
    customerOrgId: orgId,
    connectorType: 'slack',
    accountName: teamName,
    accountExternalId: teamId,
    metadata: {
      app_id: oauth.app_id ?? null,
      bot_user_id: oauth.bot_user_id ?? null,
      installer_user_id: oauth.authed_user?.id ?? null,
      is_enterprise_install: Boolean(oauth.is_enterprise_install),
    },
  });

  try {
    await storeToken({
      connectorId: connector.id,
      accessToken,
      scope: oauth.scope ?? null,
      // Slack bot tokens are long-lived and don't carry a refresh token
      // by default. v1 leaves expires_at null; rotation happens by
      // re-installing the app. (Token-rotation feature can be enabled
      // per-app and would set expires_at + refresh_token; not in v1.)
      refreshToken: oauth.authed_user?.access_token ?? null,
      expiresAt: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markConnectorError(connector.id, message);
    await recordAudit({
      connectorId: connector.id,
      customerOrgId: orgId,
      eventType: 'oauth.token_persist_failed',
      direction: 'oauth',
      status: 'failed',
      payloadSummary: { team_id: teamId },
      errorMessage: message,
    });
    return NextResponse.redirect(settingsUrl(`slack=error&reason=${encodeURIComponent(message)}`), {
      status: 302,
    });
  }

  await recordAudit({
    connectorId: connector.id,
    customerOrgId: orgId,
    eventType: 'oauth.installed',
    direction: 'oauth',
    status: 'succeeded',
    payloadSummary: {
      team_id: teamId,
      team_name: teamName,
      bot_user_id: oauth.bot_user_id ?? null,
      // We deliberately do NOT include the access_token, scope, or any
      // raw oauth payload field that could carry the bot token.
    },
  });

  return NextResponse.redirect(settingsUrl(`slack=connected&team=${encodeURIComponent(teamName)}`), {
    status: 302,
  });
}
