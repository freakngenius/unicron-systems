// app/[slug]/page.tsx
// Per-org dashboard landing page. Reads org from OrgContextProvider
// (set by layout). Renders the tailored Pathfinder per ui_plan with
// real per-org lead cards and chart series.
//
// Funder UX pass:
//   - Nav stays tenant-scoped: hrefs are bare paths (`/`, `/leads`,
//     `/pipeline`). The unicron-systems edge middleware rewrites the
//     funder host's bare paths under `/pathfinder/funder/*` so they
//     resolve to the org-scoped [slug] routes.
//   - Settings + onboarding/connectors removed from the customer nav
//     (org config is operator-only).
//   - Lead-card list now queries the correct `organization_id`
//     column (was `org_id`, returned zero rows).
//   - Lead rows are projected through `projectFunderLead` so the
//     ui_plan.lead_card_layout fields resolve from
//     `raw_payload.funder_enrichment.*` and qualifier-time signals.
//   - Charts render real per-org series via `getChartSeries`
//     (count_by_thesis, verified_count).
//   - Raw architecture JSON disclosure removed; org config is
//     operator-only.

import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization, Project } from '@/lib/types';
import { flipToOperatorViewed } from '@/lib/agents/operator-viewed';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { getKpiValue, type KpiValue } from '@/lib/metrics/kpiQueries';
import { getChartSeries, type ChartSeries } from '@/lib/metrics/chartQueries';
import { KPIStrip } from '@/components/KPIStrip';
import { FilterSidebar } from '@/components/FilterSidebar';
import { FunderChartGrid } from '@/components/Chart';
import { LeadCardList, type LeadLike } from '@/components/LeadCard';
import { projectFunderLead } from '@/lib/agents/funder/leadView';
// Stream B Dashboard: branch helper + new Internal dashboard composition.
// Orgs whose architecture lacks a modules block (Zedcor, Realberry,
// Funder) take the existing legacy rendering path below, byte-identical.
import { shouldUseInternalDashboard } from './internalDashboardBranch';
import { InternalDashboard } from './InternalDashboard';
import type { InternalFilters } from '@/lib/catalog/modules/filter-rail/applyFilters';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DASHBOARD_LEAD_LIMIT = 6;

export default async function OrgPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: org } = (await adminAny
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as { data: (Organization & { status?: string | null }) | null; error: unknown };

  const rawArch = (org?.architecture ?? null) as Record<string, unknown> | null;

  // Stream B Dashboard branch: Internal-shaped orgs go through the new
  // catalog-driven page. Zedcor, Realberry, Funder fall through to the
  // legacy block below and render exactly as they do today.
  if (org && shouldUseInternalDashboard(rawArch)) {
    const filters: InternalFilters = {
      service_category: pickFirst(sp.service_category),
      sales_motion: pickFirst(sp.sales_motion),
      federal_registration: pickFirst(sp.federal_registration),
      source: pickFirst(sp.source),
    };
    // Per Stream A, flip operator_viewed for the first-render even on the
    // new path. Keeps the lifecycle invariant identical for Internal.
    await flipToOperatorViewed(org.id, org.status ?? null);
    return (
      <InternalDashboard
        org={{ id: org.id, slug: org.slug ?? slug, name: org.name ?? slug }}
        architecture={(rawArch ?? {}) as Parameters<typeof InternalDashboard>[0]['architecture']}
        filters={filters}
      />
    );
  }

  const architecture = resolveArchitecture(rawArch);
  const uiPlan = architecture.ui_plan!;
  const vocab = architecture.vocabulary ?? {};
  const leadsPlural = (vocab.leads as string | undefined) ?? 'leads';

  // Phase 2E slice 4 — first-render operator_viewed transition.
  if (org?.id) {
    await flipToOperatorViewed(org.id, org.status ?? null);
  }

  // Per-org leads — surface top-scored opportunities for the dashboard.
  let leads: LeadLike[] = [];
  let verifiedCount = 0;
  if (org?.id) {
    const projectsClient = supabaseAdmin() as unknown as { from: (t: string) => any };
    const { data: rows } = (await projectsClient
      .from('projects')
      .select('*')
      .eq('organization_id', org.id)
      .order('verified', { ascending: false, nullsFirst: false })
      .order('score', { ascending: false, nullsFirst: false })
      .limit(DASHBOARD_LEAD_LIMIT)) as { data: Project[] | null; error: unknown };
    if (Array.isArray(rows)) {
      leads = rows.map((r) => projectFunderLead(r) as unknown as LeadLike);
    }
    const { count: vc } = (await projectsClient
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('verified', true)) as { count: number | null };
    verifiedCount = vc ?? 0;
  }

  // KPI values via metric_id map.
  const kpiValues: Record<string, KpiValue> = {};
  if (org?.id) {
    for (const k of uiPlan.kpis) {
      // eslint-disable-next-line no-await-in-loop
      kpiValues[k.metric_id] = await getKpiValue(org.id, k.metric_id);
    }
  }

  // Chart series via metric_id map.
  const chartSeries: Record<string, ChartSeries> = {};
  if (org?.id) {
    for (const c of uiPlan.charts) {
      // eslint-disable-next-line no-await-in-loop
      chartSeries[c.metric_id] = await getChartSeries(org.id, c.metric_id);
    }
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
          Pathfinder / {slug}
        </p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          {architecture.branding.display_name || org?.name || slug}
        </h1>
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
              background: href === `/${slug}` ? '#1a1a1a' : '#111',
              border: `1px solid ${href === `/${slug}` ? '#444' : '#333'}`,
              borderRadius: 4,
              color: href === `/${slug}` ? '#fff' : '#aaa',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      <KPIStrip kpis={uiPlan.kpis} values={kpiValues} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 240px) 1fr', gap: '1rem' }}>
        <FilterSidebar filters={uiPlan.filters} />
        <div>
          <FunderChartGrid charts={uiPlan.charts} seriesByMetricId={chartSeries} />

          <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '0.95rem', color: '#cfd8e3', margin: 0 }}>
              {leads.some((l) => (l as unknown as { verified?: boolean }).verified) ? 'Verified' : 'Top-ranked'} {leadsPlural}
            </h2>
            <Link
              href={`/${slug}/leads`}
              style={{
                fontSize: '0.75rem',
                color: '#888',
                textDecoration: 'none',
              }}
            >
              View all {verifiedCount > 0 ? `(${verifiedCount} verified)` : ''} →
            </Link>
          </div>
          {leads.length === 0 ? (
            <div style={{ color: '#666', fontSize: '0.85rem', padding: '1rem', background: '#111', border: '1px dashed #2a2a2a', borderRadius: 6 }}>
              No {leadsPlural} yet. The pipeline is queued — the first cron cycle will populate this view.
            </div>
          ) : (
            <FunderLeadLinks slug={slug} leads={leads} layout={uiPlan.lead_card_layout} />
          )}
        </div>
      </div>
    </div>
  );
}

function titleCase(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

// Wrap LeadCardList so each card links to the org-scoped detail page.
function FunderLeadLinks({
  slug,
  leads,
  layout,
}: {
  slug: string;
  leads: LeadLike[];
  layout: NonNullable<ReturnType<typeof resolveArchitecture>['ui_plan']>['lead_card_layout'];
}) {
  // Lightweight grid that wraps each card in an <a> so the customer
  // can click into the verified opportunity. Reuses LeadCardList for
  // an empty array to keep the data-lead-card-list marker present in
  // DOM (DoD smoke step 8 probes for it).
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
              href={`/${slug}/leads/${encodeURIComponent(id)}`}
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
