// app/api/searches/[id]/route.ts — ICP Saved Search S1.
//
// GET /api/searches/:id  →  {saved_search, latest_run:{status,phase,progress,stats}}
//
// SPEC: Pathfinder/docs/SPEC-ICP-Search.md, S1 slice. Internal-scoped via
// slug='internal'. 404 if the saved_search either does not exist or
// belongs to a different organization.

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveInternalOrgId } from '../_internal-org';
import type { SavedSearch, SearchRun } from '@/lib/types';

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
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!savedSearch) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const { data: latestRun } = await admin
    .from('search_runs')
    .select('*')
    .eq('saved_search_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latest = (latestRun ?? null) as SearchRun | null;
  return NextResponse.json({
    saved_search: savedSearch as SavedSearch,
    latest_run: latest
      ? {
          status: latest.status,
          phase: latest.phase,
          progress: latest.progress,
          stats: latest.stats,
        }
      : null,
  });
}
