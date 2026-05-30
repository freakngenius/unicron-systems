// app/api/zedcor/run-orchestrator/route.ts
//
// Sprint Z1A — POST endpoint that runs the Zedcor Houston manual orchestrator.
// Operator session check via Z1B's lib/auth/require-operator (pf-access-token
// cookie → supabase.auth.getUser → pathfinder.operator_allowlist).

import { NextResponse } from 'next/server';
import { runZedcorOrchestrator } from '@/lib/orchestrator/orchestrator';

export const runtime = 'nodejs';
// Z17 — the orchestrator now runs the full chain end-to-end in a single
// HTTP invocation (ingest → score → enrich → contact → pitch → Notion-gated
// → backfill). The pitch wave plus backfill blow past 60s once any
// in-window/awarded rows show up; bump to 300s (Vercel Pro ceiling). Hobby
// plans cap at 60s and would 504 — that is the right signal to upgrade
// rather than silently truncate the run.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    const summary = await runZedcorOrchestrator();
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
