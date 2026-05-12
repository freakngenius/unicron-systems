// api/auth/google/callback.ts — Item 4 of the Atrium usefulness pass.
//
// Receives the redirect from Google after the user authorizes Calendar
// read access. Exchanges the auth code for tokens, persists the refresh
// token via ns_set_google_calendar_tokens, then 302s back to Settings.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function originFromReq(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  return `${proto}://${host}`;
}

function redirectBack(res: VercelResponse, base: string, status: 'connected' | 'error', detail?: string) {
  const target = new URL('/atrium#settings', base);
  target.searchParams.set('google', status);
  if (detail) target.searchParams.set('detail', detail);
  res.statusCode = 302;
  res.setHeader('Location', target.toString());
  res.end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const base = originFromReq(req);

  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const stateB64 = typeof req.query.state === 'string' ? req.query.state : '';
    const errParam = typeof req.query.error === 'string' ? req.query.error : null;

    if (errParam) {
      redirectBack(res, base, 'error', errParam);
      return;
    }
    if (!code || !stateB64) {
      redirectBack(res, base, 'error', 'missing_params');
      return;
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      redirectBack(res, base, 'error', 'credential_gap');
      return;
    }

    // Decode state → member id
    let memberId = '';
    try {
      const decoded = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8')) as { m?: string };
      memberId = decoded.m ?? '';
    } catch {
      redirectBack(res, base, 'error', 'bad_state');
      return;
    }
    if (!memberId) {
      redirectBack(res, base, 'error', 'bad_state');
      return;
    }

    // Exchange code → tokens
    const redirectUri = `${base}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '');
      redirectBack(res, base, 'error', `token_exchange_${tokenRes.status}_${text.slice(0, 40)}`);
      return;
    }
    const tokenJson = await tokenRes.json() as { refresh_token?: string; access_token?: string };
    if (!tokenJson.refresh_token) {
      redirectBack(res, base, 'error', 'no_refresh_token');
      return;
    }

    // Persist via service-role
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      redirectBack(res, base, 'error', 'service_env_missing');
      return;
    }
    const sb = createClient(url, serviceKey);
    const { error: rpcErr } = await sb.rpc('ns_set_google_calendar_tokens', {
      p_member_id: memberId,
      p_refresh_token: tokenJson.refresh_token,
      p_calendar_id: 'primary',
    });
    if (rpcErr) {
      redirectBack(res, base, 'error', `persist_failed_${rpcErr.message.slice(0, 40)}`);
      return;
    }

    redirectBack(res, base, 'connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'callback failed';
    redirectBack(res, base, 'error', message.slice(0, 80));
  }
}
