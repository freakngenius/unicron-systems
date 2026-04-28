// GET /api/activity?limit=120 → AgentLogRow[]
//
// Most-recent agent_log rows, capped at the prototype's LOG_CAP of 120 rows.
// Used by the bottom-right ActivityRail (tail-f log) and as a polling fallback when
// Supabase realtime isn't available.

import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 120;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(1, Math.floor(raw)), MAX_LIMIT) : DEFAULT_LIMIT;

  const { data, error } = await supabase
    .from('agent_log')
    .select('*')
    .order('ts', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
