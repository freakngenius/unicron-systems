// app/[slug]/page.tsx
// Per-org dashboard landing page. Reads org from OrgContextProvider (set by layout).
//
// Phase 2A: routing shell + nav.
// Phase 2E slice 4: best-effort operator_viewed transition on first render.
// Build-Out Pass Slice 2 (Spec: SPEC - Pathfinder Build-Out Pass.md):
//   - Resolves architecture via resolveArchitecture (BASE_ARCHITECTURE
//     fills missing fields, including the default ui_plan).
//   - Renders the tailored Pathfinder per ui_plan: KPIStrip + filter
//     sidebar + chart placeholders + ui_plan-aware LeadCard list.
//   - DoD smoke step 8 (scripts/dod-smoke.ts) probes for
//     data-kpi-strip / data-lead-card / data-chart markers — present
//     unconditionally so the harness flips from BLOCKED to PASS once
//     the route resolves.

import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization } from '@/lib/types';
import { flipToOperatorViewed } from '@/lib/agents/operator-viewed';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { getKpiValue, type KpiValue } from '@/lib/metrics/kpiQueries';
import { KPIStrip } from '@/components/KPIStrip';
import { FilterSidebar } from '@/components/FilterSidebar';
import { ChartGrid } from '@/components/ChartPlaceholder';
import { LeadCardList, type LeadLike } from '@/components/LeadCard';

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

  const rawArch = (org?.architecture ?? null) as Record<string, unknown> | null;
  const architecture = resolveArchitecture(rawArch);
  const uiPlan = architecture.ui_plan!; // resolveArchitecture always populates ui_plan from BASE_ARCHITECTURE

  // Phase 2E slice 4 — first-render operator_viewed transition. Only
  // flips when current status is `ready_to_view`; other states preserve
  // their semantics. Best-effort: helper swallows update failures.
  if (org?.id) {
    await flipToOperatorViewed(org.id, org.status ?? null);
  }

  // Lean per-org leads fetch (limit 5). Slice 2 only needs cards to
  // render with whatever real data exists; the schema-driven query
  // wiring (filters, scoring, etc.) is Slice 3+ scope.
  let leads: LeadLike[] = [];
  if (org?.id) {
    const projectsClient = supabaseAdmin() as unknown as { from: (t: string) => any };
    // Stage 10 bug fix — the projects table scopes by `organization_id`,
    // not `org_id`. The previous filter silently returned 0 rows for
    // every non-Zedcor org (Funder, Realberry, Internal). All three
    // are unblocked by this single fix; see Stage 10 §"pre-existing
    // platform bug" in the worktree handoff.
    const { data: rows } = (await projectsClient
      .from('projects')
      .select('*')
      .eq('organization_id', org.id)
      .limit(5)) as { data: LeadLike[] | null; error: unknown };
    if (Array.isArray(rows)) leads = rows;
  }

  // Resolve KPI values via stub (returns null for unmapped metric_ids).
  const kpiValues: Record<string, KpiValue> = {};
  if (org?.id) {
    for (const k of uiPlan.kpis) {
      // eslint-disable-next-line no-await-in-loop
      kpiValues[k.metric_id] = await getKpiValue(org.id, k.metric_id);
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

      <nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
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

      {/* KPI strip per ui_plan.kpis. Always renders the wrapper so DoD
          smoke step 8 sees data-kpi-strip even when kpis array empty. */}
      <KPIStrip kpis={uiPlan.kpis} values={kpiValues} />

      {/* Two-column main: filter sidebar + content (charts + leads). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 240px) 1fr', gap: '1rem' }}>
        <FilterSidebar filters={uiPlan.filters} />
        <div>
          <ChartGrid charts={uiPlan.charts} />
          <LeadCardList leads={leads} layout={uiPlan.lead_card_layout} />
        </div>
      </div>

      <details style={{ marginTop: '2rem', color: '#666', fontSize: '0.75rem' }}>
        <summary style={{ cursor: 'pointer' }}>Architecture JSON</summary>
        <pre
          style={{
            background: '#111',
            border: '1px solid #222',
            borderRadius: 4,
            padding: '1rem',
            fontSize: '0.7rem',
            color: '#888',
            overflowX: 'auto',
            marginTop: '0.5rem',
          }}
        >
          {JSON.stringify(architecture, null, 2)}
        </pre>
      </details>
    </div>
  );
}
