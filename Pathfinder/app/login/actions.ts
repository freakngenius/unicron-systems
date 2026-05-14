'use server';

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Sanitize the post-confirm redirect target. Accepts only same-origin paths
 * starting with a single `/`; protocol-relative (`//evil.com`) and absolute
 * URLs are rejected to prevent an open-redirect on the magic-link callback.
 */
export function safeNext(next: string | undefined | null): string {
  if (!next) return '/';
  if (typeof next !== 'string') return '/';
  if (next.length > 512) return '/';
  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//')) return '/';
  return next;
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pathfinder-ashy.vercel.app/pathfinder';
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
