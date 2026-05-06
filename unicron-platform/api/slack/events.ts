// POST /api/slack/events
// Handles Slack event callbacks: message.im (DM), app_mention, member_joined_channel.
//
// Flow:
//   1. Immediately answer url_verification challenges (no signature check needed per Slack docs).
//   2. Verify HMAC-SHA256 signature for all other requests.
//   3. Return HTTP 200 to Slack within 3 seconds; dispatch real work to Inngest fire-and-forget.

import { createHmac } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the Slack request signature using HMAC-SHA256.
 * See https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(req: VercelRequest, rawBody: string): boolean {
  const timestamp = Array.isArray(req.headers['x-slack-request-timestamp'])
    ? req.headers['x-slack-request-timestamp'][0]
    : req.headers['x-slack-request-timestamp'];
  const slackSig = Array.isArray(req.headers['x-slack-signature'])
    ? req.headers['x-slack-signature'][0]
    : req.headers['x-slack-signature'];

  if (!timestamp || !slackSig) return false;

  // Reject requests older than 5 minutes (replay-attack guard)
  const fiveMinutes = 5 * 60;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > fiveMinutes) return false;

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET is not set');
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = createHmac('sha256', signingSecret);
  const computed = `v0=${hmac.update(sigBase).digest('hex')}`;

  // Constant-time comparison to prevent timing attacks
  if (computed.length !== slackSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ slackSig.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Inngest dispatch
// ---------------------------------------------------------------------------

interface SlackEventPayload {
  type: string;
  user?: string;
  channel?: string;
  text?: string;
  thread_ts?: string;
}

interface SlackCallbackPayload {
  type: string;
  challenge?: string;
  team_id?: string;
  event?: SlackEventPayload;
}

async function dispatchToInngest(payload: SlackCallbackPayload): Promise<void> {
  const event = payload.event;
  if (!event) return;

  const inngestBaseUrl = process.env.INNGEST_API_BASE_URL;
  const inngestEventKey = process.env.INNGEST_EVENT_KEY;

  if (!inngestBaseUrl || !inngestEventKey) {
    console.error('INNGEST_API_BASE_URL or INNGEST_EVENT_KEY is not set — skipping dispatch');
    return;
  }

  await fetch(`${inngestBaseUrl}/e/orchestrator/slack.event`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inngestEventKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'orchestrator/slack.event',
      data: {
        slack_user_id: event.user ?? null,
        channel_id: event.channel ?? null,
        message_text: event.text ?? '',
        thread_ts: event.thread_ts ?? null,
        event_type: event.type,
        team_id: payload.team_id ?? null,
      },
    }),
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  // Vercel parses the body automatically; we need the raw string for signature
  // verification. Reconstruct it from req.body (already parsed by Vercel middleware).
  const rawBody =
    typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf-8')
        : JSON.stringify(req.body);

  let payload: SlackCallbackPayload;
  try {
    payload = typeof req.body === 'object' && req.body !== null
      ? (req.body as SlackCallbackPayload)
      : JSON.parse(rawBody);
  } catch {
    res.status(400).json({ ok: false, error: 'invalid JSON body' });
    return;
  }

  // Slack URL verification challenge — answer before signature check (no sig present)
  if (payload.type === 'url_verification') {
    res.status(200).json({ challenge: payload.challenge });
    return;
  }

  // All other requests must have a valid signature
  if (!verifySlackSignature(req, rawBody)) {
    res.status(401).json({ ok: false, error: 'signature verification failed' });
    return;
  }

  // Acknowledge Slack immediately; dispatch to Inngest in the background.
  // We intentionally do NOT await the dispatch before returning 200 — Slack
  // requires a response within 3 seconds.
  dispatchToInngest(payload).catch((err: unknown) => {
    console.error('Inngest dispatch failed', err);
  });

  res.status(200).send('OK');
}
