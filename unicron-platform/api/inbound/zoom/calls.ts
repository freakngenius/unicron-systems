// api/inbound/zoom/calls.ts — Stream C5c of the Calls Ingestion sprint.
//
// Zoom Cloud Recording webhook receiver. Subscribes to recording.completed
// (and recording.transcript_completed) events from a Server-to-Server OAuth
// app and dispatches each matching recording to ingestCallTranscript.
//
// Two pieces of Zoom auth wire through this handler:
//
//   1. URL validation handshake. When you save the webhook URL in the Zoom
//      Marketplace app config, Zoom POSTs an `endpoint.url_validation` event
//      with a `plainToken`. We must respond with the plainToken plus an
//      HMAC-SHA256 of it using ZOOM_WEBHOOK_SECRET_TOKEN as the encryptedToken.
//      Without this, Zoom won't activate the endpoint.
//
//   2. Per-request verification. Subsequent webhook deliveries include an
//      `x-zm-signature` header of the form `v0=<hmac>` and a `x-zm-request-
//      timestamp` header. The signature covers `v0:<timestamp>:<raw body>`.
//
// Required env vars (file as Bug Fix card if missing on Vercel):
//   ZOOM_WEBHOOK_SECRET_TOKEN — secret token configured in the Zoom app's
//                               Event Subscriptions tab
//   ZOOM_HOST_EMAIL           — optional; filters to recordings hosted by this
//                               account email. Defaults to "kyle@unicron.systems".
//
// Setup steps (Bug Fix card body):
//   1. Zoom Marketplace → Build Server-to-Server OAuth App
//   2. Scopes: recording:read:admin, cloud_recording:read:list_user_recordings:admin
//   3. Event Subscriptions → Add Event Subscription
//        Notification URL: https://unicron-platform.vercel.app/api/inbound/zoom/calls
//        Event types: All Recordings → Recording Completed; Recording Transcript Completed
//   4. Copy "Secret Token" → ZOOM_WEBHOOK_SECRET_TOKEN env on unicron-platform
//   5. Activate. Zoom posts a URL validation event; handler echoes it back.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ingestCallTranscript } from '../../../lib/calls-ingest.js';

// Disable bodyParser so we can compute the HMAC over raw bytes.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function timingSafeStringCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function verifyZoomSignature(req: VercelRequest, rawBody: string): boolean {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) return false;
  const sig = req.headers['x-zm-signature'];
  const ts = req.headers['x-zm-request-timestamp'];
  if (typeof sig !== 'string' || typeof ts !== 'string') return false;
  const message = `v0:${ts}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', secret).update(message).digest('hex')}`;
  return timingSafeStringCompare(expected, sig);
}

function urlValidationResponse(plainToken: string) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '';
  const encryptedToken = createHmac('sha256', secret).update(plainToken).digest('hex');
  return { plainToken, encryptedToken };
}

// ─── Payload extractors ───────────────────────────────────────────────────────

type ZoomEvent = {
  event?: string;
  payload?: {
    plainToken?: string;
    account_id?: string;
    object?: {
      host_email?: string;
      host_id?: string;
      topic?: string;
      start_time?: string;
      participant_count?: number;
      recording_files?: Array<{
        file_type?: string;
        file_extension?: string;
        download_url?: string;
        transcript?: string;
      }>;
    };
  };
};

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function extractTranscript(event: ZoomEvent): string | undefined {
  const files = event.payload?.object?.recording_files ?? [];
  for (const f of files) {
    if (f.file_type === 'TRANSCRIPT' && typeof f.transcript === 'string') return f.transcript;
  }
  // No inline transcript — Zoom often returns a download_url instead and
  // expects the caller to fetch it. For the skeleton we accept inline only;
  // download-and-fetch is a Bug Fix follow-up.
  return undefined;
}

function extractDate(event: ZoomEvent): string | undefined {
  const t = event.payload?.object?.start_time;
  if (!t) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : undefined;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  if (!process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
    res.status(503).json({ ok: false, error: 'ZOOM_WEBHOOK_SECRET_TOKEN not configured — Zoom ingestion is disabled' });
    return;
  }

  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch {
    res.status(400).json({ ok: false, error: 'failed to read request body' });
    return;
  }

  let event: ZoomEvent;
  try {
    event = JSON.parse(raw) as ZoomEvent;
  } catch {
    res.status(400).json({ ok: false, error: 'body is not valid JSON' });
    return;
  }

  // URL validation handshake — must respond before signature check applies.
  if (event.event === 'endpoint.url_validation') {
    const plainToken = event.payload?.plainToken;
    if (!plainToken) {
      res.status(400).json({ ok: false, error: 'url_validation payload missing plainToken' });
      return;
    }
    res.status(200).json(urlValidationResponse(plainToken));
    return;
  }

  if (!verifyZoomSignature(req, raw)) {
    res.status(401).json({ ok: false, error: 'invalid Zoom signature' });
    return;
  }

  // Host filter — only ingest recordings hosted by the configured account.
  const hostFilter = process.env.ZOOM_HOST_EMAIL ?? 'kyle@unicron.systems';
  const hostEmail = event.payload?.object?.host_email;
  if (hostEmail && hostEmail.toLowerCase() !== hostFilter.toLowerCase()) {
    res.status(202).json({ ok: true, skipped: true, reason: `host email ${hostEmail} != ${hostFilter}` });
    return;
  }

  if (event.event !== 'recording.completed' && event.event !== 'recording.transcript_completed') {
    res.status(202).json({ ok: true, skipped: true, reason: `event ${event.event} not handled` });
    return;
  }

  const transcript = extractTranscript(event);
  if (!transcript) {
    res.status(202).json({
      ok: true,
      skipped: true,
      reason: 'recording arrived without inline transcript; download_url fetching is a follow-up',
    });
    return;
  }

  try {
    const result = await ingestCallTranscript(
      {
        title: asString(event.payload?.object?.topic),
        transcript,
        date: extractDate(event),
        participants: [],   // Zoom webhooks don't include participant names by default
        source: 'zoom',
      },
      'zoom_webhook',
    );
    if (result.ledger_error) {
      res.status(207).json({ ok: false, ...result });
      return;
    }
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'ingest failed' });
  }
}

export const __internals = {
  verifyZoomSignature,
  urlValidationResponse,
  extractTranscript,
  extractDate,
};
