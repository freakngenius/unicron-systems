// GET /api/cron/briefing
//
// Vercel cron schedule: 0 6 * * 5 (Friday 06:00 UTC). Generates the
// org-level Friday brief, delivers to Resend + Slack, persists to
// pathfinder.briefings + pathfinder.agent_log. Implementation in
// lib/briefing.ts so the test endpoint can share it without falling
// foul of Next.js's route-export restrictions.

import { NextResponse } from 'next/server';

import { buildOrgBriefing, deliverBriefing, writeBriefingLog } from '@/lib/briefing';

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
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  await writeBriefingLog('briefing_start', {
    message: 'org-level briefing cycle starting',
  });

  let payload;
  try {
    payload = await buildOrgBriefing();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await writeBriefingLog('error', { message: 'briefing build failed', reason });
    return NextResponse.json({ error: 'build_failed', detail: reason }, { status: 500 });
  }

  const { email, slack, briefing_id } = await deliverBriefing(payload);
  await writeBriefingLog('write_success', {
    message: `briefing complete · email=${email.ok ? 'ok' : 'fail'} · slack=${slack.ok ? 'ok' : 'fail'}`,
    briefing_id,
  });

  return NextResponse.json({
    ok: email.ok || slack.ok,
    briefing_id,
    email,
    slack,
    latency_ms: Date.now() - start,
  });
}
