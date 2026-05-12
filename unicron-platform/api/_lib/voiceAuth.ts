// Bearer-JWT operator gate for /api/voice/* handlers.
//
// Spec: unicron-platform/docs/voice/atrium-voice-integration-spec.md §4.
//
// Flow:
//   1. Read Authorization header → require `Bearer <jwt>`.
//   2. Verify JWT against Supabase auth (anon-key client, .auth.getUser).
//   3. Look up the verified email in metacron.operator_allowlist
//      (service-role client + `.schema('metacron')`).
//   4. Return { ok: true, email, role } on match; { ok: false, status, message }
//      otherwise.
//
// Exceptions: api/voice/webhook/vapi.ts uses HMAC signature verification
// (VAPI_WEBHOOK_SECRET), and api/cron/voice/*.ts uses Bearer CRON_SECRET.
// Both bypass requireVoiceAccess.
//
// Future: when api/atrium/* is retrofitted to use this same gate, rename
// requireVoiceAccess → requireOperatorAccess and move to api/_lib/operatorAuth.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export type VoiceAuthOk   = { ok: true;  email: string; role: 'founder' | 'advisor' | 'team' };
export type VoiceAuthDeny = { ok: false; status: number; message: string };
export type VoiceAuthResult = VoiceAuthOk | VoiceAuthDeny;

export async function requireVoiceAccess(
  req: VercelRequest,
  _res: VercelResponse,
): Promise<VoiceAuthResult> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'missing bearer token' };
  }
  const jwt = authHeader.slice('Bearer '.length).trim();
  if (!jwt) {
    return { ok: false, status: 401, message: 'missing bearer token' };
  }

  const url        = process.env.SUPABASE_URL          ?? process.env.VITE_SUPABASE_URL;
  const anonKey    = process.env.SUPABASE_ANON_KEY     ?? process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return { ok: false, status: 500, message: 'supabase env missing' };
  }

  // Verify the JWT against Supabase auth using an anon-key client.
  const authClient = createClient(url, anonKey);
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
  if (userErr || !userData?.user?.email) {
    return { ok: false, status: 401, message: 'invalid token' };
  }
  const email = userData.user.email.toLowerCase();

  // Allowlist check via service role against the metacron schema.
  const sb = createClient(url, serviceKey);
  const { data: row, error: rowErr } = await sb
    .schema('metacron')
    .from('operator_allowlist')
    .select('role')
    .eq('email', email)
    .maybeSingle();
  if (rowErr) {
    return { ok: false, status: 500, message: 'allowlist lookup failed' };
  }
  if (!row) {
    return { ok: false, status: 403, message: 'not on allowlist' };
  }

  const role = row.role as VoiceAuthOk['role'];
  return { ok: true, email, role };
}

export function denyResponse(res: VercelResponse, deny: VoiceAuthDeny): void {
  res.status(deny.status).json({ error: deny.message });
}
