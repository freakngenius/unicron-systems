// GET /api/stats → { new, total, ranked, err }
//
//   - new:    count of projects ingested in the last 24h (all sources, all
//             scores). Demo Polish §4.3 — the prior gating on score ≥
//             high_priority_threshold meant "New · 24h" displayed 0 for
//             stretches where the Ranker hadn't yet caught up to fresh
//             ingest. The header counter is "New Opportunities Ingested,"
//             not "Verified High-Priority in 24h" — those are different
//             signals.
//   - total:  total project count
//   - ranked: count of projects with score IS NOT NULL
//   - err:    count of agent_runs with status='failed' in the last 24h
//
// Powers the four LiveStat slots in the TopBar.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Total projects
  const totalQ = supabase.from('projects').select('id', { count: 'exact', head: true });

  // Ranked projects
  const rankedQ = supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .not('score', 'is', null);

  // New (last 24h) — every project the ingestor has written, regardless of
  // score. See header-doc above; this matches the SQL spec'd in
  // SPEC - Demo Polish & Geography Filters § 4.3.
  const newQ = supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .gte('ingested_at', dayAgo);

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
