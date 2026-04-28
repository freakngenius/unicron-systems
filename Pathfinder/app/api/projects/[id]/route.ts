// GET /api/projects/[id] → Project (404 if missing)
//
// Returns one project including rationale and raw_payload — used by ProjectModal
// when it needs to refetch (e.g., to pick up freshly-streamed rationale text).

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', params.id).maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(data);
}
