// components/lead/OrgScopedBackLink.tsx
//
// Renders a Back button whose href is derived from the current
// pathname so it returns the operator to the org-scoped dashboard
// (or org-scoped subroute) instead of /pathfinder (the Zedcor
// surface). Used by the [slug]/* not-found boundaries.
//
// Not-found.tsx files in Next.js 14 do not receive dynamic route
// params, so the slug has to be recovered from usePathname() on the
// client. This component encapsulates that detection so the
// not-found pages stay simple.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

void React;

const RESERVED_FIRST_SEGMENTS = new Set([
  'api',
  'auth',
  '_next',
  'favicon.ico',
  'login',
  'pipeline',
  'leads',
  'onboarding',
  'settings',
  'zedcor',
  'pathfinder',
  'dev',
]);

function extractSlug(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const stripped = pathname.startsWith('/pathfinder/')
    ? pathname.slice('/pathfinder/'.length)
    : pathname.startsWith('/')
      ? pathname.slice(1)
      : pathname;
  const seg = stripped.split('/')[0]?.split('?')[0]?.split('#')[0] ?? '';
  if (!seg || RESERVED_FIRST_SEGMENTS.has(seg)) return null;
  return seg;
}

export type OrgScopedBackLinkProps = {
  /** Optional path suffix appended after /<slug>. Example: "/leads". */
  leafSuffix?: string;
  /** Label fragment appended to "Back to <slug>". Example: "list". */
  leafLabel?: string;
};

export function OrgScopedBackLink({
  leafSuffix = '',
  leafLabel,
}: OrgScopedBackLinkProps): React.ReactElement {
  const pathname = usePathname();
  const slug = extractSlug(pathname);
  const href = slug ? `/${slug}${leafSuffix}` : '/';
  const label = slug
    ? leafLabel
      ? `Back to /${slug} ${leafLabel}`
      : `Back to /${slug}`
    : 'Back to dashboard';

  return (
    <Link
      data-org-scoped-back
      href={href}
      style={{
        marginTop: '0.5rem',
        padding: '0.5rem 1.25rem',
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
  );
}

export default OrgScopedBackLink;
