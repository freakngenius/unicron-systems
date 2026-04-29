// GET /api/slack/install/callback
//
// Slack's redirect target after the customer approves the app. PUBLIC —
// Slack does not send credentials, so middleware.ts exempts this path.
// Authentication is via the HMAC-signed OAuth `state` token plus the
// fact that only Slack itself can produce a valid `code` for our app.

import { NextResponse } from 'next/server';

import { publicUrl } from '@/lib/public-url';
import { auditSlack } from '@/lib/slack/bot';
import { completeInstall } from '@/lib/slack/install';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function html(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(req: Request) {
  let code: string | null = null;
  let state: string | null = null;
  try {
    const url = new URL(req.url);
    code = url.searchParams.get('code');
    state = url.searchParams.get('state');
    const slackError = url.searchParams.get('error');
    if (slackError) {
      await auditSlack('install_user_aborted', {
        message: 'install canceled by user / workspace admin',
        slack_error: slackError,
      });
      return html(
        `<h1>Slack install canceled</h1><p>Reason: ${escapeHtml(slackError)}</p><p><a href="${publicUrl()}/api/slack/install/start">Try again</a></p>`,
        400,
      );
    }
    if (!code) {
      return html('<h1>Missing code</h1>', 400);
    }
  } catch {
    return html('<h1>Bad request</h1>', 400);
  }

  try {
    const { workspace, reused } = await completeInstall({ code, state });
    return html(
      `<h1>Pathfinder installed in ${escapeHtml(workspace.team_name)}</h1>
       <p>${reused ? 'Re-install completed; token rotated.' : 'Install successful.'}</p>
       <p>Next: seed <code>pathfinder.slack_branch_routes</code> with one row per branch you want to receive lead messages.</p>
       <p><a href="${publicUrl()}/">Open Pathfinder</a></p>`,
    );
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return html(`<h1>Install failed</h1><pre>${escapeHtml(reason)}</pre>`, 500);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
