// lib/nav/orgPath.ts, Stream A Foundation.
//
// Org-context-preserving navigation helper. Every later surface uses this for
// internal links so the org slug is never dropped from a constructed href.
//
// Stream A's discovery showed several places where ad-hoc string concatenation
// produced links like `/${slug}/leads/${id}`. Encoding mistakes around colons
// in propublica project ids (e.g. `propublica:824334368` -> `propublica%3A...`)
// have caused incidents. This helper centralises the encoding so callers do
// not have to remember.
//
// Usage:
//   buildOrgPath('internal', 'leads', projectId)        -> '/internal/leads/<encoded>'
//   buildOrgPath('internal', 'leads', { segment: id, raw: true })
//                                                       -> '/internal/leads/<raw>'
//   buildOrgPath('internal')                            -> '/internal'
//   buildOrgPath('internal', 'companies')               -> '/internal/companies'
//
// The basePath '/pathfinder' is applied by Next.js at request time; this
// helper produces paths relative to basePath, matching the existing nav code
// in app/[slug]/page.tsx.

export type OrgPathSegment = string | { segment: string; raw?: boolean };

const STRIP_LEADING_SLASHES = /^\/+/;

export function buildOrgPath(slug: string, ...segments: OrgPathSegment[]): string {
  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    throw new Error('buildOrgPath: slug is required');
  }
  const head = `/${encodeURIComponent(slug)}`;
  if (segments.length === 0) return head;

  const tail = segments
    .map((s) => {
      if (typeof s === 'string') {
        const cleaned = s.replace(STRIP_LEADING_SLASHES, '');
        return cleaned === '' ? null : encodeURIComponent(cleaned);
      }
      const cleaned = s.segment.replace(STRIP_LEADING_SLASHES, '');
      if (cleaned === '') return null;
      return s.raw ? cleaned : encodeURIComponent(cleaned);
    })
    .filter((p): p is string => p !== null);

  if (tail.length === 0) return head;
  return `${head}/${tail.join('/')}`;
}

/** Convenience wrappers for the three canonical surfaces. */
export const orgPaths = {
  dashboard: (slug: string) => buildOrgPath(slug),
  leads: (slug: string) => buildOrgPath(slug, 'leads'),
  leadDetail: (slug: string, projectId: string) => buildOrgPath(slug, 'leads', projectId),
  pipeline: (slug: string) => buildOrgPath(slug, 'pipeline'),
};
