// app/[slug]/searches/[id]/page.tsx, ICP Search S3.
//
// Per-search results surface. Thin server wrapper that hands the id to
// the SearchDetailView client component which renders three sections:
//   1. The S4 SearchProgress component (phase timeline + stats).
//   2. The scored leads grid scoped to saved_search_id = :id, rendered
//      through the existing CompanyLeadCard so the visual language matches
//      the rest of the Internal surface.
//   3. Routing hooks into the existing catalog surfaces (Companies and
//      Pipeline), preserving ?saved_search_id= as a query param so reps
//      can deep-link to a filtered view of the catalog.
//
// The server wrapper exists only because Next 14 routes are server-first
// and to provide the page-level meta. All data fetching is client-side
// through lib/searches/api so tests can mock fetch in isolation.

import { SearchDetailView } from './SearchDetailView';

type Props = {
  params: Promise<{ slug: string; id: string }>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SearchDetailPage({ params }: Props) {
  const { slug, id } = await params;
  return <SearchDetailView slug={slug} id={id} />;
}
