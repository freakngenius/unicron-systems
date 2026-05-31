// components/search/SavedSearchesList.tsx, ICP Search S3.
//
// Client component that renders past hunts. Fetches GET /api/searches on
// mount through lib/searches/api.listSearches, shows real values with
// human labels (status pill, "<radius> mi" suffix, ISO date pretty), and
// links each row to /[slug]/searches/[id]. Empty state is honest: the
// component says no searches have been started yet, not filler.
//
// Server component would be simpler, but the dashboard is server-rendered
// already and starting new searches mutates the list. A client list with
// a soft refresh on window focus keeps the surface current without a
// route refresh, and isolates fetch mocking in tests.

'use client';

import * as React from 'react';
import Link from 'next/link';
import { listSearches, SearchApiError } from '@/lib/searches/api';
import type { SavedSearchSummary } from '@/lib/searches/types';
import { buildOrgPath } from '@/lib/nav/orgPath';
import { color, font, fontSize, fontWeight, letterSpacing, radius, space } from '@/lib/design/tokens';

void React;

export interface SavedSearchesListProps {
  slug: string;
  initialSearches?: SavedSearchSummary[];
}

type LoadState = 'loading' | 'ready' | 'error';

export function SavedSearchesList({
  slug,
  initialSearches,
}: SavedSearchesListProps): React.ReactElement {
  const [searches, setSearches] = React.useState<SavedSearchSummary[] | null>(
    initialSearches ?? null,
  );
  const [state, setState] = React.useState<LoadState>(initialSearches ? 'ready' : 'loading');
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await listSearches({ signal });
      setSearches(Array.isArray(res?.searches) ? res.searches : []);
      setState('ready');
      setError(null);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      const message =
        err instanceof SearchApiError
          ? `Could not load past searches (${err.status}).`
          : err instanceof Error
            ? err.message
            : 'Unknown error loading past searches.';
      setError(message);
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    const ctl = new AbortController();
    refresh(ctl.signal);
    return () => ctl.abort();
  }, [refresh]);

  return (
    <section
      data-testid="saved-searches-list"
      style={{
        border: `1px solid ${color.border}`,
        background: color.bgRaised,
        borderRadius: radius.lg,
        padding: space.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: space.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
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
            Past hunts
          </p>
          <h2
            style={{
              margin: 0,
              fontFamily: font.sans,
              fontSize: fontSize.xl,
              fontWeight: fontWeight.semi,
              color: color.text,
            }}
          >
            Saved searches
          </h2>
        </div>
        <button
          type="button"
          data-testid="saved-searches-refresh"
          onClick={() => {
            setState('loading');
            refresh();
          }}
          style={{
            padding: `${space.xs}px ${space.md}px`,
            borderRadius: radius.md,
            border: `1px solid ${color.border}`,
            background: 'transparent',
            color: color.textMuted,
            fontFamily: font.sans,
            fontSize: fontSize.eyebrow,
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {state === 'loading' && !searches ? (
        <p
          data-testid="saved-searches-loading"
          style={{ margin: 0, color: color.textMuted, fontSize: fontSize.sm }}
        >
          Loading past searches...
        </p>
      ) : null}

      {state === 'error' ? (
        <p
          data-testid="saved-searches-error"
          role="alert"
          style={{ margin: 0, color: color.danger, fontSize: fontSize.sm }}
        >
          {error}
        </p>
      ) : null}

      {searches && searches.length === 0 ? (
        <p
          data-testid="saved-searches-empty"
          style={{
            margin: 0,
            color: color.textMuted,
            fontSize: fontSize.sm,
            fontFamily: font.sans,
          }}
        >
          No searches yet. Start one above to see it appear here.
        </p>
      ) : null}

      {searches && searches.length > 0 ? (
        <ul
          data-testid="saved-searches-rows"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: space.sm,
          }}
        >
          {searches.map(s => (
            <li key={s.id}>
              <Link
                href={buildOrgPath(slug, 'searches', s.id)}
                data-testid={`saved-search-row-${s.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: space.md,
                  alignItems: 'center',
                  padding: `${space.sm}px ${space.md}px`,
                  borderRadius: radius.md,
                  border: `1px solid ${color.border}`,
                  background: color.bgSubtle,
                  textDecoration: 'none',
                  color: color.text,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
                  <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semi }}>
                    {s.name || s.icp_text || s.id}
                  </span>
                  <span style={{ color: color.textMuted, fontSize: fontSize.eyebrow }}>
                    {s.region} · {s.radius_mi} mi · {formatDate(s.created_at)}
                  </span>
                </div>
                <StatusPill status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function StatusPill({ status }: { status: string }): React.ReactElement {
  const { bg, border, text, label } = statusColors(status);
  return (
    <span
      data-testid={`saved-search-status-${status}`}
      style={{
        padding: `${space.xs}px ${space.sm}px`,
        borderRadius: radius.pill,
        background: bg,
        border: `1px solid ${border}`,
        color: text,
        fontFamily: font.mono,
        fontSize: fontSize.eyebrow,
        letterSpacing: letterSpacing.wide,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

function statusColors(status: string): { bg: string; border: string; text: string; label: string } {
  switch (status) {
    case 'complete':
      return {
        bg: color.verifiedPillBg,
        border: color.verifiedPillBorder,
        text: color.verifiedPillText,
        label: 'Complete',
      };
    case 'running':
    case 'planning':
      return {
        bg: color.accentSoft,
        border: color.borderStrong,
        text: color.accent,
        label: status === 'running' ? 'Running' : 'Planning',
      };
    case 'failed':
      return {
        bg: 'rgba(255, 107, 107, 0.10)',
        border: 'rgba(255, 107, 107, 0.35)',
        text: color.danger,
        label: 'Failed',
      };
    case 'draft':
    default:
      return {
        bg: color.bgSubtle,
        border: color.border,
        text: color.textMuted,
        label: status || 'Draft',
      };
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default SavedSearchesList;
