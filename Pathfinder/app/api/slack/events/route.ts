// POST /api/slack/events
//
// Slack Events API webhook. PUBLIC; signature-verified. middleware.ts
// exempts this path so Slack can hit it without basic-auth.
//
// Two payload types in v1:
//
//   url_verification — Slack's setup handshake; echo back the `challenge`
//                       string so the app's Event Subscriptions URL is
//                       accepted.
//   event_callback   — actual events. Only `app_uninstalled` is subscribed
//                       in v1; we stamp slack_workspaces.uninstalled_at.

import { NextResponse } from 'next/server';

import { auditSlack, verifySlackSignature } from '@/lib/slack/bot';
import { markUninstalled } from '@/lib/slack/install';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

interface SlackUrlVerificationPayload {
  type: 'url_verification';
  challenge: string;
}

interface SlackEventCallback {
  type: 'event_callback';
  team_id?: string;
  api_app_id?: string;
  event: {
    type: string;
    [key: string]: unknown;
  };
}

type SlackEventPayload = SlackUrlVerificationPayload | SlackEventCallback;

export async function POST(req: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    await auditSlack('signing_secret_missing', {
      message: 'SLACK_SIGNING_SECRET is not set; rejecting events request',
    });
    return new NextResponse('Slack signing secret not configured', { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-slack-signature');
  const timestamp = req.headers.get('x-slack-request-timestamp');

  const verify = verifySlackSignature({ signature, timestamp, body: rawBody, secret });
  if (!verify.ok) {
    await auditSlack('signature_failed', {
      message: 'rejected events request with invalid signature',
      reason: verify.reason,
    });
    return new NextResponse(`Bad signature: ${verify.reason}`, { status: 401 });
  }

  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(rawBody) as SlackEventPayload;
  } catch {
    return new NextResponse('Bad payload', { status: 400 });
  }

  if (payload.type === 'url_verification') {
    // Echo the challenge — this is the only branch that returns a non-empty body.
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === 'event_callback') {
    const eventType = payload.event?.type;
    const teamId = payload.team_id;

    if (eventType === 'app_uninstalled' && teamId) {
      try {
        await markUninstalled(teamId);
      } catch (e) {
        await auditSlack('uninstall_persist_failed', {
          message: 'markUninstalled threw',
          team_id: teamId,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
      return NextResponse.json({});
    }

    // Any other event we receive (we don't subscribe to any in v1, but
    // Slack may send platform events like `tokens_revoked` regardless) —
    // ack so Slack stops retrying, audit-log for follow-up.
    await auditSlack('event_unhandled', {
      message: 'received an event we do not handle in v1',
      event_type: eventType ?? 'unknown',
      team_id: teamId ?? null,
    });
    return NextResponse.json({});
  }

  // Unknown top-level payload type.
  await auditSlack('event_unknown_type', {
    message: 'unknown top-level event payload type',
    payload_type: (payload as { type?: string }).type ?? 'undefined',
  });
  return NextResponse.json({});
}
