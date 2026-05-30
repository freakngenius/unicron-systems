// app/[slug]/companies/page.tsx, Stream A Foundation Phase 0.
//
// /[slug]/companies redirects to /[slug]/leads. Internal (#4) uses
// vocabulary { lead: 'company', leads: 'companies' } so the nav label reads
// "Companies" but the canonical route is /leads. Before this redirect, typing
// /pathfinder/internal/companies hit Next's not-found.tsx. This page makes
// the literal vocab path resolve to the canonical surface for every org,
// not just Internal.

import { redirect } from 'next/navigation';
import { orgPaths } from '@/lib/nav/orgPath';

type Props = { params: Promise<{ slug: string }> };

export default async function CompaniesAliasPage({ params }: Props) {
  const { slug } = await params;
  redirect(orgPaths.leads(slug));
}
