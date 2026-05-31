// app/[slug]/searches/[id]/SearchDetailView.tsx, ICP Search S3.
//
// Client component for the per-search results surface. Loads the saved
// search + latest run, the leads scoped to this search, and mounts the
// SearchProgress component from S4 (mocked in tests). The leads grid
// reuses the shared CompanyLeadCard so the visual language matches the
// rest of Internal.
//
// Honest empty / thin states:
//   - While loading: a single line, no spinner theater.
//   - When the API returns < 3 leads AND the run is complete: an honest
//     "limited sources for this profile" note. Never filler.
//   - When the run is still going: a "still searching" cue under the
//     leads grid so reps know more may appear.

'use client';

import * as React from 'react';
import Link from 'next/link';
import { SearchProgress } from '@/components/search/SearchProgress';
import { getSearch, getSearchLeads, SearchApiError } from '@/lib/searches/api';
import type {
  SavedSearchDetailResponse,
  SearchLead,
  SearchStatus,
} from '@/lib/searches/types';
import { buildOrgPath } from '@/lib/nav/orgPath';
import { color, font, fontSize, fontWeight, letterSpacing, radius, space } from '@/lib/design/tokens';
import { CompanyLeadCard } from '@/components/catalog/cards/CompanyLeadCard';
import { projectToCompanyLeadView } from '@/lib/agents/internal/companyLeadView';
import type { Project } from '@/lib/types';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

void React;

export interface SearchDetailViewProps {
  slug: string;
  id: string;
}

const LIMITED_THRESHOLD = 3;

export function SearchDetailView({ slug, id }: SearchDetailViewProps): React.ReactElement {
  const [detail, setDetail] = React.useState<SavedSearchDetailResponse | null>(null);
  const [leads, setLeads] = React.useState<SearchLead[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ctl = new AbortController();
    void Promise.all([
      getSearch(id, { signal: ctl.signal }).catch(err => err as Error),
      getSearchLeads(id, { signal: ctl.signal }).catch(err => err as Error),
    ]).then(([d, l]) => {
      if (ctl.signal.aborted) return;
      if (d instanceof Error) {
        setError(formatError(d, `search ${id}`));
      } else {
        setDetail(d as SavedSearchDetailResponse);
      }
      if (l instanceof Error) {
        // Leads error is non-fatal; the progress surface still renders.
        if (!error) setError(formatError(l, `leads for ${id}`));
        setLeads([]);
      } else {
        setLeads(Array.isArray((l as { leads?: SearchLead[] }).leads) ? (l as { leads: SearchLead[] }).leads : []);
      }
    });
    return () => ctl.abort();
    // We intentionally exclude `error` from deps; this is a one-shot load
    // and the SearchProgress component owns ongoing polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const savedSearch = detail?.saved_search;
  const runStatus = (detail?.latest_run?.status ?? 'planning') as SearchStatus;
  const isComplete = runStatus === 'complete';

  return (
    <div
      data-testid="search-detail-view"
      data-search-id={id}
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
          <Link href={buildOrgPath(slug)} style={{ color: color.textMuted, textDecoration: 'none' }}>
            Pathfinder / {slug}
          </Link>{' '}
          / Search
        </p>
        <h1 style={{ margin: 0, fontSize: fontSize.hero, fontWeight: fontWeight.semi }}>
          {savedSearch?.name ?? 'Loading search...'}
        </h1>
        {savedSearch ? (
          <p
            data-testid="search-detail-summary"
            style={{
              margin: 0,
              color: color.textMuted,
              fontSize: fontSize.sm,
            }}
          >
            {savedSearch.icp_text} · {savedSearch.region} · {savedSearch.radius_mi} mi
          </p>
        ) : null}
      </header>

      <SearchProgress
        searchId={id}
        initialPayload={
          detail
            ? {
                saved_search: detail.saved_search,
                latest_run: detail.latest_run ?? null,
              }
            : null
        }
      />

      {error ? (
        <p
          data-testid="search-detail-error"
          role="alert"
          style={{ margin: 0, color: color.danger, fontSize: fontSize.sm }}
        >
          {error}
        </p>
      ) : null}

      <CatalogSurfaceLinks slug={slug} id={id} />

      <LeadsSection slug={slug} leads={leads} isComplete={isComplete} />
    </div>
  );
}

function CatalogSurfaceLinks({ slug, id }: { slug: string; id: string }): React.ReactElement {
  const q = `?saved_search_id=${encodeURIComponent(id)}`;
  const links: Array<{ href: string; label: string; testId: string }> = [
    { href: `${buildOrgPath(slug, 'leads')}${q}`, label: 'Companies', testId: 'search-detail-link-companies' },
    { href: `${buildOrgPath(slug, 'pipeline')}${q}`, label: 'Pipeline', testId: 'search-detail-link-pipeline' },
  ];
  return (
    <nav data-testid="search-detail-catalog-links" style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
      {links.map(l => (
        <Link
          key={l.href}
          href={l.href}
          data-testid={l.testId}
          style={{
            padding: `${space.sm}px ${space.md}px`,
            borderRadius: radius.md,
            border: `1px solid ${color.border}`,
            background: color.bgSubtle,
            color: color.textMuted,
            fontFamily: font.sans,
            fontSize: fontSize.sm,
            textDecoration: 'none',
          }}
        >
          Open in {l.label}
        </Link>
      ))}
    </nav>
  );
}

function LeadsSection({
  slug,
  leads,
  isComplete,
}: {
  slug: string;
  leads: SearchLead[] | null;
  isComplete: boolean;
}): React.ReactElement {
  if (leads === null) {
    return (
      <p
        data-testid="search-detail-leads-loading"
        style={{ margin: 0, color: color.textMuted, fontSize: fontSize.sm }}
      >
        Loading scored leads...
      </p>
    );
  }

  if (leads.length === 0) {
    return (
      <div data-testid="search-detail-leads-empty" style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        <p
          style={{
            margin: 0,
            color: color.textMuted,
            fontSize: fontSize.sm,
          }}
        >
          {isComplete
            ? 'Limited sources for this profile. The hunter could not find scored leads from public registries for this ICP and region.'
            : 'No scored leads yet. They will appear here as the run completes.'}
        </p>
      </div>
    );
  }

  const views = leads
    .map(lead => projectToCompanyLeadView(lead as unknown as Project))
    .filter(v => Boolean(v.id));
  // Empty schema fallback. If the API does not echo schema, CompanyLeadCard
  // tolerates `undefined` and falls back to default display labels.
  const schema = {} as LeadUnitSchema;

  return (
    <section data-testid="search-detail-leads-grid" style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2
          style={{
            margin: 0,
            fontFamily: font.sans,
            fontSize: fontSize.xl,
            fontWeight: fontWeight.semi,
          }}
        >
          Scored leads ({views.length})
        </h2>
        {!isComplete ? (
          <span
            data-testid="search-detail-still-running"
            style={{ color: color.textMuted, fontSize: fontSize.eyebrow }}
          >
            Still searching, more may appear
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: space.md,
        }}
      >
        {views.map(view => (
          <CompanyLeadCard
            key={view.id}
            view={view}
            slug={slug}
            schema={schema}
            testIdPrefix="search-detail-card"
          />
        ))}
      </div>
      {isComplete && views.length < LIMITED_THRESHOLD ? (
        <p
          data-testid="search-detail-leads-limited"
          style={{
            margin: 0,
            color: color.textMuted,
            fontSize: fontSize.sm,
          }}
        >
          Limited sources for this profile. The hunter completed the run with {views.length} scored {views.length === 1 ? 'lead' : 'leads'}; the underlying public registries returned thin coverage for this ICP and region.
        </p>
      ) : null}
    </section>
  );
}

function formatError(err: unknown, label: string): string {
  if (err instanceof SearchApiError) return `Could not load ${label} (${err.status}).`;
  if (err instanceof Error) return err.message;
  return `Unknown error loading ${label}.`;
}

export default SearchDetailView;
