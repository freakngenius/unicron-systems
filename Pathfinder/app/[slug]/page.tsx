// app/[slug]/page.tsx
// Per-org dashboard landing page. Reads org from OrgContextProvider (set by layout).
// Phase 2A: routing shell with nav to existing Pathfinder sub-pages.
// Phase 2B will add per-org data scoping and render full dashboard data here.

import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization } from '@/lib/types';
// Phase 2E slice 4 — operator-viewed transition fired on first render of
// this route. Best-effort side-effect; the helper swallows failures so a
// transient Supabase error doesn't block the page.
import { flipToOperatorViewed } from '@/lib/agents/operator-viewed';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgPage({ params }: Props) {
  const { slug } = await params;

  // Re-fetch org for display (layout already validated it exists + auth).
  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: org } = (await adminAny
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as { data: (Organization & { status?: string | null }) | null; error: unknown };

  const architecture = org?.architecture ?? {};
  const hasArchitecture = Object.keys(architecture).length > 0;

  // Phase 2E slice 4 — first-render operator_viewed transition. Only
  // flips when current status is `ready_to_view`; other states preserve
  // their semantics. Best-effort: helper swallows update failures and
  // returns a reason; rendering is unaffected.
  if (org?.id) {
    await flipToOperatorViewed(org.id, org.status ?? null);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        fontFamily: 'var(--font-inter, sans-serif)',
        padding: '2rem',
      }}
    >
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #222', paddingBottom: '1rem' }}>
        <p style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Pathfinder / {slug}
        </p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          {org?.name ?? slug}
        </h1>
      </header>

      <nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { href: '/', label: 'Dashboard' },
          { href: '/leads', label: 'Leads' },
          { href: '/pipeline', label: 'Pipeline' },
          { href: '/settings', label: 'Settings' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              padding: '0.5rem 1rem',
              background: '#111',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#aaa',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {hasArchitecture && (
        <section>
          <h2 style={{ fontSize: '0.875rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Architecture Config
          </h2>
          <pre
            style={{
              background: '#111',
              border: '1px solid #222',
              borderRadius: 4,
              padding: '1rem',
              fontSize: '0.75rem',
              color: '#aaa',
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(architecture, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
