// components/internal/CompaniesSortControl.tsx, Stream E (Internal V2).
//
// Sort control rail for the Internal Companies route. Each option flips
// the `?sort=` query string while preserving any other filters Stream B
// owns (service_category, sales_motion, federal_registration, source).
// The user-facing nav label is "Companies" but the canonical route is
// /[slug]/leads (Stream A Phase 0 redirect from /companies). Links target
// /leads so the query string survives.
// Server component (Link-based, no client JS) so it ships in the SSR
// payload and works without hydration.

import * as React from 'react';
import Link from 'next/link';
import type { SortKey } from '@/lib/agents/internal/sortCompanies';

void React;

interface SortOption {
  key: SortKey;
  label: string;
}

const OPTIONS: readonly SortOption[] = [
  { key: 'score', label: 'Score' },
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'recent', label: 'Recently added' },
] as const;

export interface CompaniesSortControlProps {
  slug: string;
  current: SortKey;
  preserve: Record<string, string | undefined>;
}

export function CompaniesSortControl({ slug, current, preserve }: CompaniesSortControlProps) {
  const baseQuery = buildBaseQuery(preserve);

  return (
    <div
      data-companies-sort
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem',
      }}
    >
      <span
        style={{
          color: '#888',
          fontSize: '0.75rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginRight: '0.25rem',
        }}
      >
        Sort
      </span>
      {OPTIONS.map(opt => {
        const isActive = opt.key === current;
        const query = new URLSearchParams(baseQuery);
        query.set('sort', opt.key);
        const href = `/${slug}/leads?${query.toString()}`;
        return (
          <Link
            key={opt.key}
            href={href}
            data-sort-key={opt.key}
            data-sort-active={isActive ? 'true' : 'false'}
            style={{
              padding: '0.35rem 0.75rem',
              background: isActive ? '#1f1f1f' : '#111',
              border: `1px solid ${isActive ? '#555' : '#2a2a2a'}`,
              borderRadius: 4,
              color: isActive ? '#fff' : '#aaa',
              fontSize: '0.8rem',
              textDecoration: 'none',
            }}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

function buildBaseQuery(preserve: Record<string, string | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(preserve)) {
    if (typeof v === 'string' && v.trim() !== '') {
      out.set(k, v);
    }
  }
  return out;
}

export default CompaniesSortControl;
