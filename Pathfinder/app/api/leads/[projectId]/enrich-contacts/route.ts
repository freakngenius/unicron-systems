// app/api/leads/[projectId]/enrich-contacts/route.ts — Demo Polish UX Gate 8B.
//
// Admin-only on-demand contact enrichment. Triggers an immediate
// Clay → Apollo → Hunter run for one lead, persists the result, returns
// the orchestrator summary for the lead.
//
// Auth: gated by middleware.ts basic-auth (BASIC_AUTH_USER / _PASS); only
// the operator has the credential, so basic-auth admission == admin
// admission per the existing Pathfinder auth model.
//
// Used by the ContactsCard "Run now" button (Gate 8C) and by Gate 8D's
// rollout script which hits this for the top-10 leads as a smoke pass
// before the daily cron is left to its own devices.

import { NextResponse } from 'next/server';
import { runEnrichment } from '@/services/contact-enricher/runner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } },
) {
  const projectId = params.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ error: 'missing_project_id' }, { status: 400 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  try {
    const summary = await runEnrichment({
      projectIdOverride: projectId,
      forceRefresh: force,
      topN: 1,
    });
    if (summary.projects_considered === 0) {
      return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
