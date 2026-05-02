// GET /api/cron/slack-alerts
//
// Vercel cron schedule: */10 * * * * (every 10 minutes; set in vercel.json).
// Scans pathfinder.projects for newly high-priority verified projects
// (score >= 90, posted_date < 60 days, not posted to Slack in last 7 days,
// not snoozed) and posts a per-lead Slack message — DM if a rep_user_id
// is configured for the project's branch, channel post with `<!here>`
// otherwise. Implementation lives in lib/slack/alerts.ts so this route
// is a thin auth + dispatch shell.

import { NextResponse } from 'next/server';

import { closeAgentRun, openAgentRun } from '@/lib/agent-runs';
import { runSlackAlerts } from '@/lib/slack/alerts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() === expected;
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('secret');
    if (q && q === expected) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const run = await openAgentRun('slack-alerts');
  try {
    const result = await runSlackAlerts();
    await closeAgentRun(run, {
      status: 'success',
      records_processed: result.scanned,
      records_new: result.posted,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await closeAgentRun(run, { status: 'failed', error_message: reason });
    return NextResponse.json({ ok: false, error: reason }, { status: 500 });
  }
}
