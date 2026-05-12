// api/auth/google/start.ts — Item 4 of the Atrium usefulness pass.
//
// Kicks off the Google Calendar OAuth flow. Requires GOOGLE_OAUTH_CLIENT_ID,
// GOOGLE_OAUTH_CLIENT_SECRET, and a bearer token resolving to a team member.
// The team_member.id is stashed in the OAuth `state` parameter so the
// callback can complete the linkage without a session cookie.
//
// Returns a JSON `{ url }` payload so the Settings page can redirect via
// window.location.assign() — keeps the bearer-token flow intact.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

function originFromReq(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method not allowed' });
      return;
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(503).json({
        ok: false,
        error: 'credential_gap',
        message:
          'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set on this deploy. ' +
          'See the open Bug Fix card for the 7-step Cloud Console setup.',
      });
      return;
    }

    // Auth — bearer token must resolve to a known team_member
    const authHeader = req.headers['authorization'];
    if (typeof authHeader !== 'string' || !authHeader.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({ ok: false, error: 'missing bearer token' });
      return;
    }
    const token = authHeader.slice(7).trim();
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      res.status(500).json({ ok: false, error: 'supabase env not configured' });
      return;
    }
    const supabase = createClient(url, anonKey);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.email) {
      res.status(401).json({ ok: false, error: 'invalid bearer token' });
      return;
    }

    // Resolve team_member by email
    const { data: memberRows, error: memberErr } = await supabase
      .rpc('ns_get_team_member_by_email', { p_email: userData.user.email });
    if (memberErr || !memberRows?.[0]?.id) {
      res.status(403).json({ ok: false, error: 'caller is not a registered team member' });
      return;
    }
    const memberId: string = memberRows[0].id;

    const redirectUri = `${originFromReq(req)}/api/auth/google/callback`;

    // OAuth state: member_id base64url + lightweight CSRF nonce
    const nonce = Math.random().toString(36).slice(2, 14);
    const stateRaw = JSON.stringify({ m: memberId, n: nonce });
    const state = Buffer.from(stateRaw, 'utf8').toString('base64url');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent'); // force refresh_token even on repeat auth
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', state);

    res.status(200).json({ ok: true, url: authUrl.toString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'start failed';
    res.status(500).json({ ok: false, error: message });
  }
}
