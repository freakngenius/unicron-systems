// GET /api/outreach-drafts
//   no query → { counts: { [projectId]: number } }   (used by ProjectList badge)
//   ?project_id=<id> → { drafts: OutreachDraft[] }   (used by ProjectModal section)
//
// Read-only. Anon supabase client — `pathfinder` schema's default privileges
// grant SELECT to anon for tables created after migration 0001 (which includes
// outreach_drafts, created in 0010). RLS is not configured on this table; if
// it ever is, the cron route will keep working via supabaseAdmin and this
// route will need to be revisited.
//
// Spec: Pathfinder/docs/PLAN-p0-02b-outreach-visible-progress.md § 4.1.

import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { OutreachDraft } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Ceiling on per-project rows. The cron writes 3 per project (one per
// channel). 50 is a generous safety bound that lets future iteration
// drafts accumulate without unbounding the response.
const PER_PROJECT_LIMIT = 50;

// Ceiling on the counts query. ~500 projects × 3 channels = 1500 rows;
// 5000 leaves headroom and keeps a single response well under 1MB.
const COUNTS_QUERY_LIMIT = 5000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');

  if (projectId) {
    return getDraftsForProject(projectId);
  }
  return getCounts();
}

async function getCounts(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('outreach_drafts')
    .select('project_id')
    .limit(COUNTS_QUERY_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const pid = (row as { project_id: string }).project_id;
    counts[pid] = (counts[pid] ?? 0) + 1;
  }
  return NextResponse.json({ counts });
}

async function getDraftsForProject(projectId: string): Promise<NextResponse> {
  if (projectId.length === 0 || projectId.length > 200) {
    return NextResponse.json({ error: 'invalid project_id' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('outreach_drafts')
    .select('*')
    .eq('project_id', projectId)
    .order('channel', { ascending: true })
    .order('draft_at', { ascending: false })
    .limit(PER_PROJECT_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ drafts: (data ?? []) as OutreachDraft[] });
}
