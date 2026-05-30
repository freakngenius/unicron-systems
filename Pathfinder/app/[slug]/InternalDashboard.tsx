// app/[slug]/InternalDashboard.tsx, Stream B Dashboard.
//
// New Internal-style dashboard composition: ranked-feed is the hero,
// filter-rail sits beside it (left), kpi-strip is slim and secondary at
// the top, analytics-charts secondary at the bottom. Zedcor, Realberry,
// and Funder do NOT route through this component (see
// internalDashboardBranch.ts); they continue to render via the existing
// page block, byte-identical to today.

import * as React from 'react';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { color, font, fontSize, fontWeight, letterSpacing, space } from '@/lib/design/tokens';
import { buildOrgPath } from '@/lib/nav/orgPath';

import { fetchRankedCompanies } from '@/lib/catalog/modules/ranked-feed/data';
import { RankedFeed } from '@/lib/catalog/modules/ranked-feed/RankedFeed';
import { FilterRail } from '@/lib/catalog/modules/filter-rail/FilterRail';
import { KpiStrip } from '@/lib/catalog/modules/kpi-strip/KpiStrip';
import { AnalyticsChartsView } from '@/lib/catalog/modules/analytics-charts/AnalyticsCharts';
import {
  byServiceCategory,
  verifiedOverTime,
} from '@/lib/catalog/modules/analytics-charts/charts';

import type { InternalFilters, RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';

type AnalyticsRow = RawCompanyRow & { ranked_at?: string | null; verified?: boolean | null };
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';
import { LeadChatLauncher } from '@/components/internal/lead-chat';

void React;

export interface InternalDashboardProps {
  org: { id: string; slug: string; name: string };
  architecture: {
    branding?: { display_name?: string | null };
    lead_unit?: { schema?: LeadUnitSchema };
    modules?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
    sources?: ReadonlyArray<{ id?: string; type?: string }>;
  };
  filters: InternalFilters;
}

const FEED_LIMIT = 50;

export async function InternalDashboard({ org, architecture, filters }: InternalDashboardProps): Promise<React.ReactElement> {
  const admin = supabaseAdmin() as unknown as Parameters<typeof fetchRankedCompanies>[1]['admin'];
  const schema: LeadUnitSchema = architecture.lead_unit?.schema as LeadUnitSchema;
  const sources = (architecture.sources ?? [])
    .filter((s): s is { id: string; type?: string } => typeof s?.id === 'string');

  // Ranked feed (hero) data, narrowed by filters in memory.
  const rankedRows = await fetchRankedCompanies(org.id, { admin, limit: FEED_LIMIT, filters });

  // Analytics charts data: pull an unfiltered, larger window for trend math.
  // Keep the query small; analytics is secondary.
  const allRows = await fetchAllForAnalytics(org.id);
  const byCategory = byServiceCategory(allRows);
  const byDay = verifiedOverTime(allRows, { days: 14 });

  const kpiConfig = (architecture.modules?.['kpi-strip']?.config ?? {}) as {
    metrics?: readonly string[];
    labels?: Record<string, string>;
  };

  const displayName = architecture.branding?.display_name ?? org.name ?? org.slug;

  return (
    <div
      data-testid="internal-dashboard"
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
            style={{
              padding: `${space.sm}px ${space.md}px`,
              borderRadius: 4,
              border: `1px solid ${tab.active ? color.borderStrong : color.border}`,
              background: tab.active ? color.bgRaised : color.bgSubtle,
              color: tab.active ? color.text : color.textMuted,
              fontFamily: font.sans,
              fontSize: fontSize.sm,
              textDecoration: 'none',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Slim secondary KPI strip at the top */}
      <KpiStrip
        config={kpiConfig}
        deps={{
          orgId: org.id,
          admin: admin as unknown as Parameters<typeof KpiStrip>[0]['deps']['admin'],
          architecture: {
            sources,
            lead_unit: { schema: schema as unknown as Record<string, { type?: string; enum_values?: readonly string[]; display_label?: string }> },
          },
        }}
      />

      {/* Hero: filter rail + ranked feed */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 260px) 1fr',
          gap: space.lg,
          alignItems: 'start',
        }}
      >
        <FilterRail schema={schema} sources={sources} initialFilters={filters} />
        <RankedFeed rows={rankedRows} slug={org.slug} schema={schema} />
      </div>

      {/* Secondary analytics, below the hero */}
      <AnalyticsChartsView byCategory={byCategory} byDay={byDay} schema={schema} />

      {/* Stream H: Internal Lead Chat Agent (additive, Internal-only mount). */}
      <LeadChatLauncher
        orgSlug={org.slug}
        orgId={org.id}
        scopeLabel={`All ${displayName} companies`}
      />
    </div>
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
