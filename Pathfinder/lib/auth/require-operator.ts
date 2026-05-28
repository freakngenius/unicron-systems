// lib/auth/require-operator.ts
// Shared operator-session check used by the (authenticated) route group layout
// AND by the /api/zedcor/* API routes. Mirrors app/[slug]/layout.tsx:58-90 —
// pf-access-token cookie → supabase.auth.getUser → operator_allowlist lookup.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';

export type OperatorIdentity = { email: string; role: 'operator' | 'admin' };

export type OperatorAuthResult =
  | { ok: true; identity: OperatorIdentity }
  | { ok: false; status: 401 | 403 | 500; reason: string };

export async function getOperatorIdentity(): Promise<OperatorAuthResult> {
  const cookieStore = cookies();
  const token = cookieStore.get('pf-access-token')?.value;
  if (!token) return { ok: false, status: 401, reason: 'no_session' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, status: 500, reason: 'misconfigured' };

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email) return { ok: false, status: 401, reason: 'invalid_token' };

  const admin = supabaseAdmin() as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { email: string; role: 'operator' | 'admin' } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data: entry } = await admin
    .from('operator_allowlist')
    .select('email, role')
    .eq('email', data.user.email)
    .maybeSingle();

  if (!entry) return { ok: false, status: 403, reason: 'unauthorized' };

  return { ok: true, identity: { email: data.user.email, role: entry.role } };
}

export function operatorDenied(result: Extract<OperatorAuthResult, { ok: false }>): NextResponse {
  return NextResponse.json({ error: result.reason }, { status: result.status });
}
