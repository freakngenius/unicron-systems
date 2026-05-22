// app/[slug]/not-found.tsx
//
// Org-scoped 404. Replaces the global app/not-found.tsx when the
// notFound() segment fires inside the [slug] subtree (e.g. an org
// fetch returns no row in [slug]/layout.tsx). Without this file, a
// 404 inside /pathfinder/<slug>/* would render the global not-found
// whose only action is a "Back to dashboard" button pointing at "/"
// (i.e. /pathfinder, the Zedcor surface). That stranded operators on
// Zedcor and was the most user-visible piece of the back-link defect.
//
// not-found.tsx files do not receive dynamic route params in Next.js
// 14, so the slug is recovered from usePathname() via the small
// OrgScopedBackLink Client Component. The global app/not-found.tsx
// is untouched: Zedcor's bare-route 404s keep existing behavior.

import { OrgScopedBackLink } from '@/components/lead/OrgScopedBackLink';

export default function OrgNotFound() {
  return (
    <div
      data-org-not-found
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        fontFamily: 'var(--font-inter, sans-serif)',
        flexDirection: 'column',
        gap: '1rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <p
        style={{
          color: '#555',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        404
      </p>
      <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
        Page not found
      </h1>
      <p style={{ color: '#666', fontSize: '0.875rem', margin: 0 }}>
        That page does not exist inside this workspace.
      </p>
      <OrgScopedBackLink />
    </div>
  );
}
