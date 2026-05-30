// app/[slug]/InternalDashboard.tsx, Stream F (rebuilt on top of Stream B).
//
// Stream F rework of the Internal dashboard composition.
//
// Layout, two tabs driven by ?view= URL param:
//   - feed (default): one SmartSearch bar (Stream F) at the top, the
//     ranked-feed hero (Stream B, consuming E's fixed card) full-width
//     beneath. No sidebar, no KPI strip.
//   - metrics: a MetricsView (Stream F) of plain-language KPI cards with
//     tooltips, with the secondary AnalyticsChartsView (Stream B) beneath.
//
// Stream B's KpiStrip and FilterRail components are NOT mounted from this
// file anymore. They remain in the registry untouched so other entry
// points (or a future rework) can still mount them. Zedcor, Realberry,
// and Funder do NOT route through this component (see
// internalDashboardBranch.ts); they continue to render via the legacy
// page block, byte-identical.

import * as React from 'react';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { color, font, fontSize, fontWeight, letterSpacing, space } from '@/lib/design/tokens';
import { buildOrgPath } from '@/lib/nav/orgPath';

import { fetchRankedCompanies } from '@/lib/catalog/modules/ranked-feed/data';
import { RankedFeed } from '@/lib/catalog/modules/ranked-feed/RankedFeed';
import { SmartSearch } from '@/lib/catalog/modules/smart-search/SmartSearch';
import { MetricsView } from '@/lib/catalog/modules/metrics-view/MetricsView';
import { AnalyticsChartsView } from '@/lib/catalog/modules/analytics-charts/AnalyticsCharts';
// Stream H: Internal Lead Chat Agent. Persistent floating launcher; mounts
// on every Internal dashboard render regardless of which tab the rep is on.
import { LeadChatLauncher } from '@/components/internal/lead-chat';
import {
  byServiceCategory,
  verifiedOverTime,
} from '@/lib/catalog/modules/analytics-charts/charts';

import type { InternalFilters, RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';

type AnalyticsRow = RawCompanyRow & { ranked_at?: string | null; verified?: boolean | null };
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

void React;

export type InternalDashboardView = 'feed' | 'metrics';

export interface InternalDashboardProps {
  org: { id: string; slug: string; name: string };
  architecture: {
    branding?: { display_name?: string | null };
    lead_unit?: { schema?: LeadUnitSchema };
    modules?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
    sources?: ReadonlyArray<{ id?: string; type?: string }>;
  };
  filters: InternalFilters;
  view: InternalDashboardView;
}

const FEED_LIMIT = 50;

export async function InternalDashboard({
  org,
  architecture,
  filters,
  view,
}: InternalDashboardProps): Promise<React.ReactElement> {
  const admin = supabaseAdmin() as unknown as Parameters<typeof fetchRankedCompanies>[1]['admin'];
  const schema: LeadUnitSchema = architecture.lead_unit?.schema as LeadUnitSchema;
  const sources = (architecture.sources ?? [])
    .filter((s): s is { id: string; type?: string } => typeof s?.id === 'string');

  const displayName = architecture.branding?.display_name ?? org.name ?? org.slug;
  const isMetrics = view === 'metrics';

  return (
    <div
      data-testid="internal-dashboard"
      data-view={view}
      style={{
        minHeight: '100vh',
        background: color.bg,
        color: color.text,
        fontFamily: font.sans,
        padding: `${space.xl}px ${space.xxl}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: space.xl,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
        <p
          style={{
            margin: 0,
            color: color.textMuted,
            fontFamily: font.mono,
            fontSize: fontSize.eyebrow,
            letterSpacing: letterSpacing.wider,
            textTransform: 'uppercase',
          }}
        >
          Pathfinder / {org.slug}
        </p>
        <h1 style={{ margin: 0, fontSize: fontSize.hero, fontWeight: fontWeight.semi }}>{displayName}</h1>
      </header>

      <nav style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
        {[
          { href: buildOrgPath(org.slug), label: 'Dashboard', active: true },
          { href: buildOrgPath(org.slug, 'leads'), label: 'Companies', active: false },
          { href: buildOrgPath(org.slug, 'pipeline'), label: 'Pipeline', active: false },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            style={navTabStyle(tab.active)}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/*
        Stream F tab strip. Sits below the route nav so the rep sees Feed
        first and Metrics is one click away. Each tab preserves any current
        ?q= / ?service_category= refinements via buildTabHref so a deep
        link from a filtered feed survives the switch.
      */}
      <div role="tablist" aria-label="Dashboard view" data-testid="dashboard-view-tabs" style={{ display: 'flex', gap: space.xs }}>
        <Link
          role="tab"
          aria-selected={!isMetrics}
          data-testid="view-tab-feed"
          href={buildTabHref(org.slug, 'feed', filters)}
          style={viewTabStyle(!isMetrics)}
        >
          Feed
        </Link>
        <Link
          role="tab"
          aria-selected={isMetrics}
          data-testid="view-tab-metrics"
          href={buildTabHref(org.slug, 'metrics', filters)}
          style={viewTabStyle(isMetrics)}
        >
          Metrics
        </Link>
      </div>

      {isMetrics ? (
        <MetricsSection
          orgId={org.id}
          architecture={architecture}
          admin={admin as unknown as Parameters<typeof MetricsView>[0]['deps']['admin']}
        />
      ) : (
        <FeedSection org={org} architecture={architecture} filters={filters} schema={schema} sources={sources} admin={admin} />
      )}

      {/* Stream H: Internal Lead Chat Agent. Stays mounted across the tab
          toggle so the rep does not lose chat state when flipping views. */}
      <LeadChatLauncher
        orgSlug={org.slug}
        orgId={org.id}
        scopeLabel={`All ${displayName} companies`}
      />
    </div>
  );
}

function navTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: `${space.sm}px ${space.md}px`,
    borderRadius: 4,
    border: `1px solid ${active ? color.borderStrong : color.border}`,
    background: active ? color.bgRaised : color.bgSubtle,
    color: active ? color.text : color.textMuted,
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    textDecoration: 'none',
  };
}

function viewTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: `${space.sm}px ${space.lg}px`,
    borderBottom: `2px solid ${active ? color.accent : 'transparent'}`,
    color: active ? color.text : color.textMuted,
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    fontWeight: active ? fontWeight.semi : fontWeight.medium,
    textDecoration: 'none',
  };
}

/**
 * Build the href for a view tab. Carries the live filter params through
 * so toggling Feed <-> Metrics preserves the rep's narrowed context.
 */
function buildTabHref(slug: string, view: InternalDashboardView, filters: InternalFilters): string {
  const base = buildOrgPath(slug);
  const params = new URLSearchParams();
  if (view !== 'feed') params.set('view', view);
  for (const f of ['service_category', 'sales_motion', 'federal_registration', 'source', 'q'] as const) {
    const v = filters[f];
    if (typeof v === 'string' && v.trim() !== '') params.set(f, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

async function FeedSection({
  org,
  architecture: _architecture,
  filters,
  schema,
  sources,
  admin,
}: {
  org: { id: string; slug: string; name: string };
  architecture: InternalDashboardProps['architecture'];
  filters: InternalFilters;
  schema: LeadUnitSchema;
  sources: ReadonlyArray<{ id: string; type?: string }>;
  admin: Parameters<typeof fetchRankedCompanies>[1]['admin'];
}): Promise<React.ReactElement> {
  void _architecture;
  const rankedRows = await fetchRankedCompanies(org.id, { admin, limit: FEED_LIMIT, filters });
  return (
    <>
      <SmartSearch schema={schema} sources={sources} initialFilters={filters} />
      <RankedFeed rows={rankedRows} slug={org.slug} schema={schema} />
    </>
  );
}

async function MetricsSection({
  orgId,
  architecture,
  admin,
}: {
  orgId: string;
  architecture: InternalDashboardProps['architecture'];
  admin: Parameters<typeof MetricsView>[0]['deps']['admin'];
}): Promise<React.ReactElement> {
  const sources = (architecture.sources ?? []).filter(
    (s): s is { id: string; type?: string } => typeof s?.id === 'string',
  );
  const metricsViewConfig = architecture.modules?.['metrics-view']?.config as
    | { metrics?: readonly string[] }
    | undefined;
  // For Stream F, charts stay on the metrics tab as secondary context.
  const allRows = await fetchAllForAnalytics(orgId);
  const schema: LeadUnitSchema = architecture.lead_unit?.schema as LeadUnitSchema;
  const byCategory = byServiceCategory(allRows);
  const byDay = verifiedOverTime(allRows, { days: 14 });

  return (
    <>
      <MetricsView
        config={metricsViewConfig}
        deps={{
          orgId,
          admin,
          architecture: {
            sources,
            lead_unit: {
              schema: schema as unknown as Record<string, { type?: string; enum_values?: readonly string[]; display_label?: string }>,
            },
          },
        }}
      />
      <AnalyticsChartsView byCategory={byCategory} byDay={byDay} schema={schema} />
    </>
  );
}

async function fetchAllForAnalytics(orgId: string): Promise<AnalyticsRow[]> {
  try {
    const admin = supabaseAdmin() as unknown as { from: (t: string) => any };
    const res = await admin
      .from('projects')
      .select('id, organization_id, score, title, source, raw_payload, verified, ranked_at')
      .eq('organization_id', orgId)
      .eq('verified', true)
      .limit(10_000);
    if (res?.error || !Array.isArray(res?.data)) return [];
    return res.data as AnalyticsRow[];
  } catch {
    return [];
  }
}

export default InternalDashboard;
