// GET /api/stats → { new, total, ranked, err }
//
//   - new:    count of high-priority projects (score >= 80) ingested in the last 24h
//   - total:  total project count
//   - ranked: count of projects with score IS NOT NULL
//   - err:    count of agent_runs with status='failed' in the last 24h
//
// Powers the four LiveStat slots in the TopBar.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const HI_THRESHOLD = 80;

export async function GET() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Total projects
  const totalQ = supabase.from('projects').select('id', { count: 'exact', head: true });

  // Ranked projects
  const rankedQ = supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .not('score', 'is', null);

  // High-priority new (last 24h)
  const newQ = supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .gte('ingested_at', dayAgo)
    .gte('score', HI_THRESHOLD);

  // Failed runs (last 24h)
  const errQ = supabase
    .from('agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('started_at', dayAgo);

  const [totalRes, rankedRes, newRes, errRes] = await Promise.all([totalQ, rankedQ, newQ, errQ]);

  if (totalRes.error || rankedRes.error || newRes.error || errRes.error) {
    const msg =
      totalRes.error?.message ?? rankedRes.error?.message ?? newRes.error?.message ?? errRes.error?.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    new: newRes.count ?? 0,
    total: totalRes.count ?? 0,
    ranked: rankedRes.count ?? 0,
    err: errRes.count ?? 0,
  });
}
