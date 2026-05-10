'use server';

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';

export async function sendMagicLink(email: string): Promise<{ error?: string }> {
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

  const { error } = await client.auth.signInWithOtp({
    email: email.toLowerCase().trim(),
    options: { emailRedirectTo: `${appUrl}/auth/callback` },
  });

  if (error) return { error: error.message };
  return {};
}
