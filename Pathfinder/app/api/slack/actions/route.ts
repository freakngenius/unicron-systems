// POST /api/slack/actions
//
// Slack interactivity webhook — handles button clicks (block_actions)
// and modal submits (view_submission). PUBLIC; signature-verified.
// middleware.ts exempts this path so Slack can hit it without basic-auth.
//
// Slack signs `application/x-www-form-urlencoded` payloads; the JSON
// payload is in the `payload` field. We must verify the signature
// against the raw body bytes BEFORE parsing.

import { NextResponse } from 'next/server';

import {
  dispatchSlackInteractivity,
  type SlackInteractivityPayload,
} from '@/lib/slack/actions';
import { auditSlack, verifySlackSignature } from '@/lib/slack/bot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function POST(req: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    await auditSlack('signing_secret_missing', {
      message: 'SLACK_SIGNING_SECRET is not set; rejecting interactivity request',
    });
    return new NextResponse('Slack signing secret not configured', { status: 503 });
  }

  // Read the raw body — must be the exact bytes Slack signed.
  const rawBody = await req.text();
  const signature = req.headers.get('x-slack-signature');
  const timestamp = req.headers.get('x-slack-request-timestamp');

  const verify = verifySlackSignature({ signature, timestamp, body: rawBody, secret });
  if (!verify.ok) {
    await auditSlack('signature_failed', {
      message: 'rejected interactivity request with invalid signature',
      reason: verify.reason,
    });
    return new NextResponse(`Bad signature: ${verify.reason}`, { status: 401 });
  }

  // Slack sends application/x-www-form-urlencoded with a single `payload` field.
  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get('payload');
  if (!payloadRaw) {
    await auditSlack('payload_missing', {
      message: 'interactivity request had no `payload` field',
    });
    return new NextResponse('Missing payload', { status: 400 });
  }

  let payload: SlackInteractivityPayload;
  try {
    payload = JSON.parse(payloadRaw) as SlackInteractivityPayload;
  } catch {
    await auditSlack('payload_unparsable', { message: 'payload was not valid JSON' });
    return new NextResponse('Bad payload', { status: 400 });
  }

  try {
    const result = await dispatchSlackInteractivity(payload);
    return NextResponse.json(result.body ?? {}, { status: result.status });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await auditSlack('action_dispatch_failed', {
      message: 'unhandled error in dispatchSlackInteractivity',
      reason,
    });
    // Still 200 so Slack stops retrying — we logged for follow-up.
    return NextResponse.json({}, { status: 200 });
  }
}
