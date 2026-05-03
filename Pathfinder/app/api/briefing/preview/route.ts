// /pathfinder/api/briefing/preview — Demo Polish UX Gate 13W-C.
//
// Composes a daily brief for the current operator and returns
// markdown + html + metrics WITHOUT sending. Used by the settings
// page's preview pane and by `Send me one now` button to show what's
// about to ship before triggering /dispatch.
//
// Auth: requires the basic-auth principal to be in OPERATOR_EMAILS.

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId } from '@/lib/connectors/auth';
import { composeDailyBrief } from '@/services/briefer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const userId = getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const brief = await composeDailyBrief({
      userId,
      now: new Date(),
    });
    return NextResponse.json({ brief });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'compose_failed', detail: reason }, { status: 500 });
  }
}
