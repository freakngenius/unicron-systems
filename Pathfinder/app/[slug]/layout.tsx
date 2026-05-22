// app/[slug]/layout.tsx
// OrgContext provider + operator session validation.
//
// Flow:
// 1. Fetch org by slug → 404 if not found.
// 2. If slug is in PUBLIC_SLUGS → skip the Supabase session round-trip and
//    render with the org's operator-allowlist role inferred as 'viewer'.
//    This is the customer-direct-URL path (e.g. funder.unicron.systems
//    routes here via the unicron-systems middleware rewrite); the prior
//    Supabase magic-link → atrium Site URL fallback broke this flow.
// 3. Read pf-access-token cookie → redirect /login if missing.
// 4. Validate token via Supabase Auth (getUser) → redirect /login if invalid.
// 5. Check email in operator_allowlist → redirect /login?error=unauthorized if not found.
// 6. Render OrgContextProvider with org + operator metadata.

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { OrgContextProvider } from '@/lib/org-context';
import type { Organization, OperatorAllowlistEntry } from '@/lib/types';

type LayoutProps = { children: React.ReactNode; params: Promise<{ slug: string }> };

// Slugs whose dashboards are reachable without the Pathfinder operator
// Supabase login. The customer reaches them via their own subdomain
// (e.g. funder.unicron.systems) which is host-routed by the
// unicron-systems edge middleware onto /pathfinder/<slug>. Adding a
// slug here makes that surface public — no /login redirect, no
// pf-access-token cookie, no operator_allowlist check.
const PUBLIC_SLUGS = new Set(['funder', 'internal']);

export default async function OrgLayout({ children, params }: LayoutProps) {
  const { slug } = await params;

  // Fetch org
  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: org } = (await adminAny
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as { data: Organization | null; error: unknown };

  if (!org) notFound();

  if (PUBLIC_SLUGS.has(slug)) {
    return (
      <OrgContextProvider
        org={org as Organization}
        userEmail={`viewer@${slug}.unicron.systems`}
        userRole="operator"
      >
        {children}
      </OrgContextProvider>
    );
  }

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
