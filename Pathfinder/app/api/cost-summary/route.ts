// GET /api/cost-summary
//
// Cumulative model-routing telemetry across the full lifetime of the fleet.
// Used by the Multi-Model Routing Strip to surface a real "TOTAL spent"
// and "$/lead" instead of a last-hour-only window that goes empty between
// cycles. Persistent — the numbers are derived from agent_log + projects,
// so they stay correct across page refreshes, new visitors, and deploys.
//
// Response:
//   { model_calls: { 'claude-sonnet': 92, 'claude-haiku-4-5': 19, ... },
//     total_calls: 212,
//     total_ranked: 32 }
//
// Cost is computed client-side via lib/realtime MODEL_META so price-table
// edits don't require a server-side deploy.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  // All model_used events. Pulled in 1000-row pages — this fleet writes
  // <500 model_route events/day, so 5000 rows covers ~10 days. Bump the
  // limit if cumulative drift ever matters more than freshness.
  const callsRes = await supabase
    .from('agent_log')
    .select('model_used')
    .not('model_used', 'is', null)
    .limit(5000);

  // Total ranked projects (cumulative).
  const rankedRes = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .not('score', 'is', null);

  if (callsRes.error || rankedRes.error) {
    return NextResponse.json(
      { error: callsRes.error?.message ?? rankedRes.error?.message },
      { status: 500 },
    );
  }

  const rows = (callsRes.data ?? []) as Array<{ model_used: string | null }>;
  const model_calls: Record<string, number> = {};
  for (const r of rows) {
    if (!r.model_used) continue;
    model_calls[r.model_used] = (model_calls[r.model_used] || 0) + 1;
  }
  const total_calls = rows.length;
  const total_ranked = rankedRes.count ?? 0;

  return NextResponse.json({ model_calls, total_calls, total_ranked });
}
