// GET /api/projects?branch=hou-002&source=usaspending → Project[]
//
// Optional filters:
//   - branch: Branch.id — restricts to projects whose nearest_branch_id matches
//   - source: ProjectSource — restricts to a single source
//
// Order: score desc (nulls last), then ingested_at desc.

import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branch = searchParams.get('branch');
  const source = searchParams.get('source');

  let q = supabase
    .from('projects')
    .select('*')
    .order('score', { ascending: false, nullsFirst: false })
    .order('ingested_at', { ascending: false });

  if (branch) q = q.eq('nearest_branch_id', branch);
  if (source) q = q.eq('source', source);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
