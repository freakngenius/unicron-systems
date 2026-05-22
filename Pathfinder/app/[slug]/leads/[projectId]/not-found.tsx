// app/[slug]/leads/[projectId]/not-found.tsx
//
// 404 boundary for the org-scoped lead detail route. Fires when the
// page calls notFound() because no project row matches the given
// projectId for the given org. Co-located with the page on purpose:
// in Next.js 14 the not-found boundary closest to where notFound()
// was called is the one that renders; relying on the [slug]-level
// not-found.tsx alone leaves Next.js falling back to the root
// app/not-found.tsx whose "Back to dashboard" link strands the
// operator on the Zedcor surface at /pathfinder.

import { OrgScopedBackLink } from '@/components/lead/OrgScopedBackLink';

export default function ProjectNotFound() {
  return (
    <div
      data-org-lead-not-found
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
        Record not found
      </h1>
      <p style={{ color: '#666', fontSize: '0.875rem', margin: 0 }}>
        No record with that id exists in this workspace.
      </p>
      <OrgScopedBackLink leafSuffix="/leads" leafLabel="list" />
    </div>
  );
}
