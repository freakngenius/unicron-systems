// app/api/cron/internal-digest/route.ts
//
// Internal daily morning digest cron route. Delegates to the Stream D
// daily-digest module runner (lib/catalog/modules/daily-digest/runner.ts),
// which owns the gating (slack integration + verified_companies non-empty)
// and the reuse of the existing briefer + Slack-alert path.
//
// Auth: Authorization: Bearer ${CRON_SECRET} per the existing cron pattern.
// Schedule: registered in vercel.json with numeric day-of-week.

import { NextResponse } from 'next/server';
import { runInternalDailyDigest } from '@/lib/catalog/modules/daily-digest/runner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim() === expected;
  try {
    const q = new URL(req.url).searchParams.get('secret');
    if (q && q === expected) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const windowHours = Number(url.searchParams.get('hours') ?? '24');
  const topN = Number(url.searchParams.get('top_n') ?? '10');
  const dryRun = url.searchParams.get('dry_run') === '1';

  try {
    const result = await runInternalDailyDigest({
      windowHours,
      topN,
      dryRun,
    });
    return NextResponse.json({
      generated_at: result.generated_at,
      organization_id: result.organization_id,
      window_hours: result.window_hours,
      total_verified: result.total_verified,
      top_n: result.top_n,
      entries: result.digest?.entries ?? [],
      slack_text: result.digest?.slack_text ?? null,
      slack_result: result.slack_result,
      kanban_result: result.kanban_result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/org .* not found/i.test(message)) {
      return NextResponse.json({ error: 'Internal org not found' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
