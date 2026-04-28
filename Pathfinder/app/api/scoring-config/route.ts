// GET  /api/scoring-config  → latest scoring constants
// POST /api/scoring-config  → append a new row (history-preserved)
//
// Persistence + helpers live in `lib/scoring-config-server.ts` so other
// routes (stats, the Verifier cron) can import them. Next.js App Router
// disallows non-handler exports from route files, hence the split.

import { NextResponse, type NextRequest } from 'next/server';

import {
  appendScoringConfig,
  fetchActiveScoringConfig,
  SCORING_DEFAULTS,
  type ScoringConfig,
} from '@/lib/scoring-config-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const config = await fetchActiveScoringConfig();
  return NextResponse.json(config);
}

export async function POST(req: NextRequest) {
  let body: Partial<ScoringConfig>;
  try {
    body = (await req.json()) as Partial<ScoringConfig>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Each field is optional in the payload — missing fields fall back to
  // the active value so the client only sends deltas. After the merge
  // every field is clamped to a sane integer.
  const active = await fetchActiveScoringConfig();
  const next: ScoringConfig = {
    high_priority_threshold: clamp(
      numericOr(body.high_priority_threshold, active.high_priority_threshold),
      0,
      100,
    ),
    score_tolerance: clamp(numericOr(body.score_tolerance, active.score_tolerance), 0, 100),
    default_coverage_miles: clamp(
      numericOr(body.default_coverage_miles, active.default_coverage_miles),
      10,
      5000,
    ),
  };

  try {
    await appendScoringConfig(next);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown_error' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, config: next, defaults: SCORING_DEFAULTS });
}

function numericOr(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : (v as number | undefined);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
