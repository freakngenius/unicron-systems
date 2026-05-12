// Browser fetch wrapper that injects the Supabase session access token as
// `Authorization: Bearer <jwt>` for every /api/voice/* request.
//
// Server-side, api/_lib/voiceAuth.ts verifies the JWT and checks the email
// against metacron.operator_allowlist.
//
// Returns the raw Response. Callers handle JSON parsing + error shaping.

import { getSupabase } from '../../lib/supabase';

export async function voiceFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const { data: { session } } = await getSupabase().auth.getSession();
  const token = session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
