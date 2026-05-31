// app/api/searches/[id]/leads/route.ts — ICP Saved Search S1.
//
// GET /api/searches/:id/leads  →  Project[] where saved_search_id = :id
//
// SPEC: Pathfinder/docs/SPEC-ICP-Search.md, S1 slice. Internal-scoped via
// slug='internal'. 404 if the saved_search either does not exist or
// belongs to a different organization. Ordered score desc nulls last,
// then ingested_at desc to match /api/projects.

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveInternalOrgId } from '../../_internal-org';
import type { Project } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'id_required' }, { status: 400 });
  }
  const orgId = await resolveInternalOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: 'internal_org_not_found' },
      { status: 404 },
    );
  }
  const admin = supabaseAdmin();
  const { data: savedSearch } = await admin
    .from('saved_searches')
    .select('id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!savedSearch) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const { data, error } = await admin
    .from('projects')
    .select('*')
    .eq('saved_search_id', id)
    .order('score', { ascending: false, nullsFirst: false })
    .order('ingested_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((data ?? []) as Project[]);
}
