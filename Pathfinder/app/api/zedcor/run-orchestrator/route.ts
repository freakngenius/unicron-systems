// app/api/zedcor/run-orchestrator/route.ts
//
// Sprint Z1A — POST endpoint that runs the Zedcor Houston manual orchestrator.
// Auth handled by Pathfinder/middleware.ts (basic-auth gates every route).

import { NextResponse } from 'next/server';
import { runZedcorOrchestrator } from '@/lib/orchestrator/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel hobby; Pro can raise this.
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
