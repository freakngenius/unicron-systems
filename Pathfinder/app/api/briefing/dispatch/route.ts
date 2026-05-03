// /pathfinder/api/briefing/dispatch — Demo Polish UX Gate 13W-C.
//
// POST — composes a brief for the current operator and sends it via
// their connected email integration (Gate 9D routing). Bypasses the
// BRIEFING_CRON_ENABLED gate and the cron's per-user timezone /
// pause checks — this is the operator-initiated `Send me one now`
// path. Logs to outreach_sends with type='briefing'.
//
// Auth: requires the basic-auth principal to be in OPERATOR_EMAILS.

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId } from '@/lib/connectors/auth';
import { composeDailyBrief, sendDailyBrief } from '@/services/briefer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let brief;
  try {
    brief = await composeDailyBrief({ userId, now: new Date() });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'compose_failed', detail: reason }, { status: 500 });
  }
  const result = await sendDailyBrief({ userId, brief });
  if (!result.ok) {
    // 412 specifically for no-active-integration so the UI can prompt
    // the operator to connect a mailbox; 502 for everything else.
    const status = result.error === 'no_active_integration' ? 412 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? 'send_failed',
        provider: result.provider,
        outreach_send_id: result.outreach_send_id,
      },
      { status },
    );
  }
  return NextResponse.json({
    ok: true,
    message_id: result.message_id,
    provider: result.provider,
    outreach_send_id: result.outreach_send_id,
    brief: {
      subject: brief.subject,
      metrics: brief.metrics,
      sections_rendered: brief.sections_rendered,
    },
  });
}
