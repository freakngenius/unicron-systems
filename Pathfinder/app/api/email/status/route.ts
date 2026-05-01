// GET /api/email/status?actor=rep@zedcor.com → EmailIntegrationStatus[]
//
// Anon-safe: token columns are stripped server-side. Used by the lead
// detail composer to decide whether to show "Send via Gmail" / "Send via
// Outlook" buttons or "Connect your email" call-to-action.

import { NextResponse, type NextRequest } from 'next/server';

import { listIntegrationStatuses } from '@/lib/email/integrations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const actor = searchParams.get('actor');
  if (!actor) {
    return NextResponse.json({ error: 'actor_required' }, { status: 400 });
  }
  try {
    const statuses = await listIntegrationStatuses({ actorEmail: actor });
    return NextResponse.json(statuses);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
