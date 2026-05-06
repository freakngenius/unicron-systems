// app/api/ingest/fathom/route.ts — Sprint 1 Stream C
//
// Fathom webhook receiver. Translates Fathom's recording.completed payload
// into the standard /api/ingest call schema and dispatches it.
//
// Fathom webhook docs: https://fathom.video/help/webhooks
//
// Signature verification:
//   TODO: Fathom uses an HMAC-SHA256 signature in the `X-Fathom-Signature`
//   header (format: "sha256=<hex>"). The signing secret is stored in
//   FATHOM_WEBHOOK_SECRET. As of Sprint 1 (2026-05-06) we've applied a
//   best-effort implementation below, but it should be verified against a
//   real Fathom webhook payload before relying on it in production. If
//   Fathom changes the header name or algorithm, update FATHOM_SIG_HEADER
//   and the HMAC construction below.
//
// Fathom payload shape (inferred from docs + reasonable defaults):
//   As of Sprint 1 the exact nested structure is not fully documented.
//   The fields below are verified against the Fathom webhook docs summary
//   page but may require adjustment when a real webhook fires.
//   See TODO comment in parseFathomPayload for fields to double-check.

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

// Header Fathom uses to pass the webhook signature.
// TODO: confirm this is the exact header name from a live Fathom webhook.
const FATHOM_SIG_HEADER = 'x-fathom-signature';

// ─── Fathom payload types ─────────────────────────────────────────────────────

interface FathomParticipant {
  name?: string;
  email?: string;
  // Fathom may include additional fields — we only use name + email.
  [key: string]: unknown;
}

interface FathomRecording {
  id: string;
  title?: string;
  summary?: string;
  transcript?: string;
  participants?: FathomParticipant[];
  started_at?: string;   // ISO 8601
  ended_at?: string;     // ISO 8601
  // TODO: verify if Fathom sends a URL field for the recording itself
  url?: string;
  [key: string]: unknown;
}

interface FathomWebhookPayload {
  event: string;
  recording: FathomRecording;
  [key: string]: unknown;
}

// ─── Standard ingest schema (mirrors Sprint 0 / route.ts shape) ───────────────

interface IngestCallBody {
  source_type: 'call';
  source_id: string;
  source_url: string | null;
  raw_content: string;
  participants: { name?: string; email?: string }[];
  captured_at: string;
  captured_by: { type: 'agent'; id: string };
  metadata: {
    recorder: 'fathom';
    fathom_recording_id: string;
    title?: string;
    summary?: string;
    started_at?: string;
    ended_at?: string;
  };
}

// ─── Signature verification ───────────────────────────────────────────────────

function verifyFathomSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — skip verification (dev/test mode).
    // Log a warning so operators know this is insecure.
    console.warn('[fathom-webhook] FATHOM_WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }
  if (!signatureHeader) {
    console.warn('[fathom-webhook] No signature header present — rejecting');
    return false;
  }

  // Fathom format: "sha256=<hex-digest>"
  // TODO: verify this is the exact format from a live Fathom webhook.
  const expectedMac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  const expected = `sha256=${expectedMac}`;

  // Constant-time compare to guard against timing attacks.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── Payload translation ──────────────────────────────────────────────────────

function parseFathomPayload(payload: FathomWebhookPayload): IngestCallBody {
  const rec = payload.recording;

  // Map participants: Fathom may return an array of objects with name/email.
  // TODO: confirm the exact participant object shape from a live Fathom webhook.
  const participants = (rec.participants ?? []).map((p) => ({
    ...(p.name ? { name: p.name } : {}),
    ...(p.email ? { email: p.email } : {}),
  }));

  // Use ended_at as captured_at (when the recording completed).
  // Fall back to started_at, then now.
  const captured_at = rec.ended_at ?? rec.started_at ?? new Date().toISOString();

  // Build raw_content: prefer full transcript, fall back to summary, then title.
  // TODO: confirm Fathom field names from a live webhook — 'transcript' vs
  // 'transcription', 'summary' vs 'meeting_summary', etc.
  const raw_content =
    rec.transcript ??
    rec.summary ??
    rec.title ??
    `Fathom recording ${rec.id} — no transcript available`;

  return {
    source_type: 'call',
    source_id: `fathom:${rec.id}`,
    source_url: rec.url ?? null,
    raw_content,
    participants,
    captured_at,
    captured_by: {
      type: 'agent',
      // System actor ID used by automated ingest flows
      id: '9696088f-b3c5-4536-a4c6-c7a40312ad6b',
    },
    metadata: {
      recorder: 'fathom',
      fathom_recording_id: rec.id,
      ...(rec.title ? { title: rec.title } : {}),
      ...(rec.summary ? { summary: rec.summary } : {}),
      ...(rec.started_at ? { started_at: rec.started_at } : {}),
      ...(rec.ended_at ? { ended_at: rec.ended_at } : {}),
    },
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body for signature verification (must happen before .json()).
  const rawBody = await req.text();

  // Verify signature
  const sigHeader = req.headers.get(FATHOM_SIG_HEADER);
  if (!verifyFathomSignature(rawBody, sigHeader)) {
    console.warn('[fathom-webhook] Signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse JSON
  let payload: FathomWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as FathomWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // We only handle recording.completed events
  if (payload.event !== 'recording.completed') {
    // Return 200 immediately — Fathom may send other event types we don't
    // need to process.
    console.log(`[fathom-webhook] Ignoring event type: ${payload.event}`);
    return NextResponse.json({ status: 'ignored', event: payload.event });
  }

  if (!payload.recording?.id) {
    return NextResponse.json({ error: 'Missing recording.id in payload' }, { status: 400 });
  }

  // Translate to standard ingest shape
  const ingestBody = parseFathomPayload(payload);

  // Forward to /api/ingest. We call the route handler function directly
  // (avoids an HTTP round-trip and works on Vercel Edge / serverless).
  const ingestKey = process.env.UNICRON_INGEST_API_KEY;
  if (!ingestKey) {
    console.error('[fathom-webhook] UNICRON_INGEST_API_KEY not set — cannot forward to /api/ingest');
    return NextResponse.json({ error: 'Ingest API key not configured' }, { status: 500 });
  }

  // Build the internal request and call /api/ingest POST handler directly.
  const { POST: ingestPost } = await import('@/app/api/ingest/route');
  const internalReq = new NextRequest('http://localhost/api/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-unicron-api-key': ingestKey,
    },
    body: JSON.stringify(ingestBody),
  });

  const ingestResp = await ingestPost(internalReq);
  const ingestData = await ingestResp.json();

  // Return 200 to Fathom immediately regardless of the ingest outcome.
  // Fathom expects a 2xx response; if we return non-2xx it will retry.
  console.log('[fathom-webhook] Forwarded to /api/ingest', {
    fathom_recording_id: payload.recording.id,
    ingest_status: ingestData.status ?? 'unknown',
  });

  return NextResponse.json({
    status: 'accepted',
    fathom_recording_id: payload.recording.id,
    ingest_status: ingestData.status ?? 'unknown',
  });
}
