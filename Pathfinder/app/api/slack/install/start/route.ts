// GET /api/slack/install/start
//
// Operator-initiated Slack OAuth install. Basic-auth-gated by middleware.ts —
// only operators with the dashboard credentials can trigger an install. The
// OAuth `state` token is HMAC-signed (see lib/slack/install.ts) so the
// public callback can verify the redirect actually originated here.

import { NextResponse } from 'next/server';

import { auditSlack } from '@/lib/slack/bot';
import { buildInstallUrl } from '@/lib/slack/install';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  try {
    const { url } = buildInstallUrl();
    await auditSlack('install_started', { message: 'operator initiated Slack install' });
    return NextResponse.redirect(url, { status: 302 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await auditSlack('install_start_failed', { message: 'install start route failed', reason });
    return new NextResponse(`Slack install start failed: ${reason}`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
