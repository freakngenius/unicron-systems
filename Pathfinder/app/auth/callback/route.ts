// app/auth/callback/route.ts
// Supabase Auth magic-link callback for operator sign-in.
//
// Supabase hits this route with ?token_hash=<hash>&type=email after the operator
// clicks the magic link. We verify the OTP, check the operator_allowlist, then
// store the session tokens in httpOnly cookies before redirecting.
//
// Excluded from Basic-auth middleware — email clients open this URL without credentials.
// Own auth: OTP token_hash from Supabase + allowlist enforcement.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/';

  // Build absolute base from forwarded host (handles reverse-proxy at unicron.systems).
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https';
  const base = forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin;

  function redirectTo(path: string) {
    return NextResponse.redirect(new URL(path, base));
  }

  if (!token_hash || type !== 'email') {
    return redirectTo('/login?error=invalid_link');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return redirectTo('/login?error=misconfigured');

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await client.auth.verifyOtp({ token_hash, type: 'email' });
  if (error || !data.session || !data.user?.email) {
    return redirectTo('/login?error=invalid_token');
  }

  const { session, user } = data;

  // Defense-in-depth allowlist check (login action already checked, this catches edge cases).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: entry } = (await admin
    .from('operator_allowlist')
    .select('role')
    .eq('email', user.email)
    .maybeSingle()) as { data: { role: string } | null };

  if (!entry) {
    return redirectTo('/login?error=unauthorized');
  }

  const response = redirectTo(next);
  const cookieOpts = { httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge: SESSION_MAX_AGE, path: '/' };
  response.cookies.set({ name: 'pf-access-token', value: session.access_token, ...cookieOpts });
  response.cookies.set({ name: 'pf-refresh-token', value: session.refresh_token, ...cookieOpts });

  return response;
}
