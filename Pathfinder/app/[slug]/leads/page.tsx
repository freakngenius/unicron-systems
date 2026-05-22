// app/[slug]/leads/page.tsx
//
// Org-scoped opportunity list. Renders all projects for the org as
// LeadCardList entries projected through `projectFunderLead`. Same
// header + nav shape as the dashboard so the funder customer sees a
// consistent surface across tabs.
//
// Zedcor is unaffected — Zedcor uses its own /zedcor/leads route.

import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization, Project } from '@/lib/types';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { projectFunderLead } from '@/lib/agents/funder/leadView';
import { LeadCardList, type LeadLike } from '@/components/LeadCard';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgLeadsPage({ params }: Props) {
  const { slug } = await params;

  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: org } = (await adminAny
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as { data: Organization | null };

  const architecture = resolveArchitecture((org?.architecture ?? null) as Record<string, unknown> | null);
  const uiPlan = architecture.ui_plan!;
  const vocab = architecture.vocabulary ?? {};
  const leadsPlural = (vocab.leads as string | undefined) ?? 'leads';

  // Pull all org-scoped projects, top scored first; verified first.
  let leads: LeadLike[] = [];
  let total = 0;
  let verifiedCount = 0;
  if (org?.id) {
    const projectsClient = supabaseAdmin() as unknown as { from: (t: string) => any };
    const { data: rows, count } = (await projectsClient
      .from('projects')
      .select('*', { count: 'exact' })
      .eq('organization_id', org.id)
      .order('verified', { ascending: false, nullsFirst: false })
      .order('score', { ascending: false, nullsFirst: false })
      .limit(200)) as { data: Project[] | null; count: number | null };
    if (Array.isArray(rows)) {
      leads = rows.map((r) => projectFunderLead(r) as unknown as LeadLike);
    }
    total = count ?? leads.length;
    const { count: vc } = (await projectsClient
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('verified', true)) as { count: number | null };
    verifiedCount = vc ?? 0;
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
      <header style={{ marginBottom: '1.5rem', borderBottom: '1px solid #222', paddingBottom: '1rem' }}>
        <p
          style={{
            color: '#666',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.25rem',
          }}
        >
          Pathfinder / {slug} / {leadsPlural}
        </p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          {titleCase(leadsPlural)}
        </h1>
        <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.4rem' }}>
          {total} total · {verifiedCount} verified
        </p>
      </header>

      <nav data-funder-nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { href: '/', label: 'Dashboard' },
          { href: '/leads', label: titleCase(leadsPlural) },
          { href: '/pipeline', label: 'Pipeline' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              padding: '0.5rem 1rem',
              background: href === '/leads' ? '#1a1a1a' : '#111',
              border: `1px solid ${href === '/leads' ? '#444' : '#333'}`,
              borderRadius: 4,
              color: href === '/leads' ? '#fff' : '#aaa',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <div style={{ color: '#666', fontSize: '0.9rem', padding: '2rem', background: '#111', border: '1px dashed #2a2a2a', borderRadius: 6, textAlign: 'center' }}>
          No {leadsPlural} yet.
        </div>
      ) : (
        <FunderLeadGrid slug={slug} leads={leads} layout={uiPlan.lead_card_layout} />
      )}
    </div>
  );
}

function titleCase(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function FunderLeadGrid({
  slug: _slug,
  leads,
  layout,
}: {
  slug: string;
  leads: LeadLike[];
  layout: NonNullable<ReturnType<typeof resolveArchitecture>['ui_plan']>['lead_card_layout'];
}) {
  return (
    <>
      <LeadCardList leads={[]} layout={layout} />
      <div
        data-funder-lead-grid
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {leads.map((lead) => {
          const id = lead.id as string | undefined;
          if (!id) return null;
          return (
            <Link
              key={id}
              href={`/leads/${encodeURIComponent(id)}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <LeadCardList leads={[lead]} layout={layout} />
            </Link>
          );
        })}
      </div>
    </>
  );
}
