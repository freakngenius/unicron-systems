// POST /api/slack/events
// Handles Slack event callbacks: message.im (DM), app_mention, member_joined_channel.
//
// Flow:
//   1. Read raw body bytes from stream (bodyParser disabled — required for HMAC verification).
//   2. Immediately answer url_verification challenges.
//   3. Verify HMAC-SHA256 signature for all other requests.
//   4. Return HTTP 200 to Slack within 3 seconds; dispatch real work to Inngest fire-and-forget.

import { createHmac } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

// Disable Vercel's JSON body parser — we need the raw bytes to verify Slack's HMAC signature.
// If Vercel pre-parses the body, JSON.stringify(req.body) diverges from the original bytes
// and the signature check always fails.
export const config = { api: { bodyParser: false } };

// ---------------------------------------------------------------------------
// Raw body reader
// ---------------------------------------------------------------------------

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySlackSignature(req: IncomingMessage, rawBody: string): boolean {
  const timestamp = Array.isArray(req.headers['x-slack-request-timestamp'])
    ? req.headers['x-slack-request-timestamp'][0]
    : req.headers['x-slack-request-timestamp'];
  const slackSig = Array.isArray(req.headers['x-slack-signature'])
    ? req.headers['x-slack-signature'][0]
    : req.headers['x-slack-signature'];

  if (!timestamp || !slackSig) return false;

  // Reject requests older than 5 minutes (replay-attack guard)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 5 * 60) return false;

  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    console.error('[slack/events] SLACK_SIGNING_SECRET not set');
    return false;
  }

  const sigBase = `v0:${timestamp.trim()}:${rawBody}`;
  const computed = `v0=${createHmac('sha256', signingSecret).update(sigBase).digest('hex')}`;

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
  subtype?: string;
  bot_id?: string;
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

  // Ignore bot-originated messages to prevent infinite self-loops.
  // The orchestrator posts replies to Slack, which triggers new message.im events.
  // Without this guard those replies re-enter the pipeline forever.
  if (event.subtype === 'bot_message' || event.bot_id) {
    console.log('[slack/events] ignoring bot message — skipping dispatch');
    return;
  }

  const inngestBaseUrl = process.env.INNGEST_API_BASE_URL?.trim();
  const inngestEventKey = process.env.INNGEST_EVENT_KEY?.trim();

  if (!inngestBaseUrl || !inngestEventKey) {
    console.error('[slack/events] INNGEST_API_BASE_URL or INNGEST_EVENT_KEY not set — skipping dispatch');
    return;
  }

  const url = `${inngestBaseUrl}/e/${inngestEventKey}`;
  console.log(`[slack/events] dispatching to Inngest: ${url.slice(0, 40)}...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  if (res.ok) {
    console.log(`[slack/events] Inngest dispatch ok: ${res.status}`);
  } else {
    const body = await res.text();
    console.error(`[slack/events] Inngest dispatch failed: ${res.status} ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
    return;
  }

  // Slack retries failed deliveries with X-Slack-Retry-Num header.
  // Acknowledge immediately so retries don't re-process and flood users.
  if (req.headers['x-slack-retry-num']) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  const rawBody = await readRawBody(req);

  let payload: SlackCallbackPayload;
  try {
    payload = JSON.parse(rawBody) as SlackCallbackPayload;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' }));
    return;
  }

  // Slack URL verification challenge — answer before signature check (no sig present)
  if (payload.type === 'url_verification') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ challenge: payload.challenge }));
    return;
  }

  if (!verifySlackSignature(req, rawBody)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'signature verification failed' }));
    return;
  }

  // Dispatch to Inngest before responding — ensures the fetch completes before
  // the serverless function terminates. Still within Slack's 3s window (<500ms).
  try {
    await dispatchToInngest(payload);
  } catch (err: unknown) {
    console.error('[slack/events] Inngest dispatch error', err);
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}
