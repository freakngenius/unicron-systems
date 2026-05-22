'use server';

import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { safeNext } from './safe-next';

/**
 * Build the magic-link callback origin from the inbound request host so
 * a sign-in started at funder.unicron.systems comes back to
 * funder.unicron.systems (not atrium.unicron.systems, which is the
 * Supabase project's Site URL fallback when emailRedirectTo fails the
 * allowlist).
 *
 * Falls back to the legacy NEXT_PUBLIC_APP_URL env (or the hardcoded
 * pathfinder-ashy.vercel.app default) only when no forwarded host is
 * present — i.e. the same shape the previous implementation used.
 *
 * basePath note: Pathfinder is served at `/pathfinder` on the
 * pathfinder-ashy origin. The funder.unicron.systems host rewrites
 * incoming requests onto that basePath via the unicron-systems edge
 * middleware (PR #460), so the per-host origin returned here is
 * basePath-free for tenant hosts and basePath-suffixed for the legacy
 * fallback. The auth/callback route lives at /auth/callback under the
 * Pathfinder basePath; that path resolves correctly under both.
 */
function buildCallbackOrigin(): string {
  const h = headers();
  const forwardedHost = h.get('x-forwarded-host') ?? h.get('host');
  const forwardedProto = h.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) {
    // Tenant hosts (funder.unicron.systems, etc.) are routed via the
    // unicron-systems edge middleware which rewrites everything under
    // the Pathfinder basePath transparently — the browser URL stays on
    // the tenant host with no /pathfinder prefix. Pathfinder's own
    // origin (pathfinder-ashy.vercel.app) keeps the basePath.
    const isPathfinderOrigin = forwardedHost.endsWith('.vercel.app');
    return isPathfinderOrigin
      ? `${forwardedProto}://${forwardedHost}/pathfinder`
      : `${forwardedProto}://${forwardedHost}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://pathfinder-ashy.vercel.app/pathfinder';
}

export async function sendMagicLink(
  email: string,
  next?: string,
): Promise<{ error?: string }> {
  // Check allowlist before sending OTP — don't send magic links to unauthorized emails.
  const admin = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: entry } = (await admin
    .from('operator_allowlist')
    .select('email')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle()) as { data: { email: string } | null };

  if (!entry) return { error: 'Email not authorized for operator access.' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { error: 'Auth not configured.' };

  const appUrl = buildCallbackOrigin();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Propagate `next` through the callback so the operator lands on their
  // intended target (e.g. /[slug]) after magic-link confirm, not on the
  // Pathfinder root. Seam #6 of the demo-path repair.
  const safe = safeNext(next);
  const redirect =
    safe === '/'
      ? `${appUrl}/auth/callback`
      : `${appUrl}/auth/callback?next=${encodeURIComponent(safe)}`;

  const { error } = await client.auth.signInWithOtp({
    email: email.toLowerCase().trim(),
    options: { emailRedirectTo: redirect },
  });

  if (error) return { error: error.message };
  return {};
}
