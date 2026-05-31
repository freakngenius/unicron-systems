// app/[slug]/leads/page.tsx
//
// Org-scoped opportunity list. Same header + nav shape as the dashboard
// so the funder customer sees a consistent surface across tabs.
//
// Stream E (Internal V2 cards + companies): Internal-shaped orgs
// (architecture.lead_unit.name === 'company', slug='internal') project
// rows through projectToCompanyLeadView and render via the shared
// CompanyLeadCard so the cards show real values with human labels and
// the one-line "why" from the rationale (no more raw COMPANY_NAME /
// SERVICE_CATEGORY / FOOTPRINT / SALES_MOTION uppercase keys with
// blank values). The Companies list, the Dashboard ranked feed (Stream
// B), and the Pipeline kanban (Stream G) all render through the same
// CompanyLeadCard. Sort controls (?sort=score|name|category|recent)
// replace the implicit score-desc ordering. The Funder/Realberry/Zedcor
// path stays byte-identical: it still projects through projectFunderLead
// and renders through LeadCard with the original SQL ordering.

import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization, Project } from '@/lib/types';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { projectFunderLead } from '@/lib/agents/funder/leadView';
import {
  projectToCompanyLeadView,
  type CompanyLeadView,
} from '@/lib/agents/internal/companyLeadView';
import { parseSortKey, sortCompanies, type SortKey } from '@/lib/agents/internal/sortCompanies';
import { LeadCardList, type LeadLike } from '@/components/LeadCard';
import { CompanyLeadCard } from '@/components/catalog/cards/CompanyLeadCard';
import { CompaniesSortControl } from '@/components/internal/CompaniesSortControl';
import { space } from '@/lib/design/tokens';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function OrgLeadsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

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

  const isInternalShape = architecture.lead_unit?.name === 'company';
  const sortKey: SortKey = isInternalShape ? parseSortKey(pickFirst(sp.sort)) : 'score';
  // ICP Search S3: when arrived from a saved-search detail page, scope the
  // listing to that search. Internal-only; Funder branch is untouched.
  const savedSearchId = isInternalShape ? pickFirst(sp.saved_search_id) : undefined;

  // Pull all org-scoped projects. Internal sorts in JS after projection so
  // the visible "Category" label (display string) drives ordering; Funder
  // keeps the existing SQL ordering byte-identical to today.
  let funderLeads: LeadLike[] = [];
  let internalLeads: CompanyLeadView[] = [];
  let total = 0;
  let verifiedCount = 0;

  if (org?.id) {
    const projectsClient = supabaseAdmin() as unknown as { from: (t: string) => any };

    if (isInternalShape) {
      let q: any = projectsClient
        .from('projects')
        .select('*', { count: 'exact' })
        .eq('organization_id', org.id);
      if (savedSearchId) {
        // Additive narrowing: only return leads tied to this saved search.
        // The saved_search_id column is added by the S1 migration; if the
        // migration has not yet landed in this environment, Supabase
        // returns an error which the catch below tolerates (empty list).
        q = q.eq('saved_search_id', savedSearchId);
      }
      const { data: rows, count, error } = (await q.limit(500)) as {
        data: Project[] | null;
        count: number | null;
        error: { message?: string } | null;
      };
      if (Array.isArray(rows) && !error) {
        internalLeads = sortCompanies(rows.map(r => projectToCompanyLeadView(r)), sortKey);
      }
      total = count ?? internalLeads.length;
    } else {
      const { data: rows, count } = (await projectsClient
        .from('projects')
        .select('*', { count: 'exact' })
        .eq('organization_id', org.id)
        .order('verified', { ascending: false, nullsFirst: false })
        .order('score', { ascending: false, nullsFirst: false })
        .limit(200)) as { data: Project[] | null; count: number | null };
      if (Array.isArray(rows)) {
        funderLeads = rows.map(r => projectFunderLead(r) as unknown as LeadLike);
      }
      total = count ?? funderLeads.length;
    }

    const { count: vc } = (await projectsClient
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('verified', true)) as { count: number | null };
    verifiedCount = vc ?? 0;
  }

  const internalSchema: LeadUnitSchema = isInternalShape
    ? ((architecture.lead_unit?.schema ?? undefined) as LeadUnitSchema)
    : undefined;

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
          { href: `/${slug}`, label: 'Dashboard' },
          { href: `/${slug}/leads`, label: titleCase(leadsPlural) },
          { href: `/${slug}/pipeline`, label: 'Pipeline' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              padding: '0.5rem 1rem',
              background: href === `/${slug}/leads` ? '#1a1a1a' : '#111',
              border: `1px solid ${href === `/${slug}/leads` ? '#444' : '#333'}`,
              borderRadius: 4,
              color: href === `/${slug}/leads` ? '#fff' : '#aaa',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {isInternalShape ? (
        <>
          <CompaniesSortControl
            slug={slug}
            current={sortKey}
            preserve={{
              service_category: pickFirst(sp.service_category),
              sales_motion: pickFirst(sp.sales_motion),
              federal_registration: pickFirst(sp.federal_registration),
              source: pickFirst(sp.source),
            }}
          />
          {internalLeads.length === 0 ? (
            <div style={{ color: '#666', fontSize: '0.9rem', padding: '2rem', background: '#111', border: '1px dashed #2a2a2a', borderRadius: 6, textAlign: 'center' }}>
              No {leadsPlural} yet.
            </div>
          ) : (
            <InternalCompanyGrid
              slug={slug}
              leads={internalLeads}
              schema={internalSchema}
            />
          )}
        </>
      ) : funderLeads.length === 0 ? (
        <div style={{ color: '#666', fontSize: '0.9rem', padding: '2rem', background: '#111', border: '1px dashed #2a2a2a', borderRadius: 6, textAlign: 'center' }}>
          No {leadsPlural} yet.
        </div>
      ) : (
        <FunderLeadGrid slug={slug} leads={funderLeads} layout={uiPlan.lead_card_layout} />
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
              href={`/${_slug}/leads/${encodeURIComponent(id)}`}
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

function InternalCompanyGrid({
  slug,
  leads,
  schema,
}: {
  slug: string;
  leads: CompanyLeadView[];
  schema: LeadUnitSchema;
}) {
  return (
    <div
      data-internal-company-grid
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: space.md,
      }}
    >
      {leads.map((lead) => (
        <CompanyLeadCard
          key={lead.id}
          view={lead}
          slug={slug}
          schema={schema}
          testIdPrefix="companies-card"
        />
      ))}
    </div>
  );
}
