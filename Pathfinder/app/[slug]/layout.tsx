// app/[slug]/layout.tsx
// OrgContext provider + operator session validation.
//
// Flow:
// 1. Fetch org by slug → 404 if not found.
// 2. Read pf-access-token cookie → redirect /login if missing.
// 3. Validate token via Supabase Auth (getUser) → redirect /login if invalid.
// 4. Check email in operator_allowlist → redirect /login?error=unauthorized if not found.
// 5. Render OrgContextProvider with org + operator metadata.

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { OrgContextProvider } from '@/lib/org-context';
import type { Organization, OperatorAllowlistEntry } from '@/lib/types';

type LayoutProps = { children: React.ReactNode; params: Promise<{ slug: string }> };

export default async function OrgLayout({ children, params }: LayoutProps) {
  const { slug } = await params;

  // Fetch org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: org } = (await adminAny
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as { data: Organization | null; error: unknown };

  if (!org) notFound();

  // Validate operator session
  const cookieStore = cookies();
  const accessToken = cookieStore.get('pf-access-token')?.value;

  if (!accessToken) redirect('/login');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) redirect('/login?error=misconfigured');

  const authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);

  if (authError || !user?.email) redirect('/login');

  // Allowlist check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminWrite = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: entry } = (await adminWrite
    .from('operator_allowlist')
    .select('email, role')
    .eq('email', user.email)
    .maybeSingle()) as { data: OperatorAllowlistEntry | null };

  if (!entry) redirect('/login?error=unauthorized');

  return (
    <OrgContextProvider
      org={org as Organization}
      userEmail={user.email}
      userRole={entry.role}
    >
      {children}
    </OrgContextProvider>
  );
}
