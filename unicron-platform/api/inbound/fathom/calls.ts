// api/inbound/fathom/calls.ts — Stream C5b of the Calls Ingestion sprint.
//
// Receives a Fathom webhook on `recording.completed` (and similar events),
// verifies the HMAC-SHA256 signature, filters by a configured tag/title to
// avoid ingesting personal meetings, then dispatches to ingestCallTranscript
// (lib/calls-ingest.ts) which writes the transcript to Notion + the ledger.
//
// Required env vars (file as Bug Fix card if missing on Vercel):
//   FATHOM_WEBHOOK_SECRET  — HMAC-SHA256 shared secret from Fathom webhook config
//   FATHOM_TAG_FILTER      — optional; case-insensitive substring. Defaults to
//                            "unicron" so personal calls are skipped silently.
//
// Setup steps (also in the Bug Fix card body):
//   1. Fathom → Settings → Integrations → Webhooks → New Webhook
//   2. URL:    https://unicron-platform.vercel.app/api/inbound/fathom/calls
//   3. Events: recording.completed (and meeting.completed if available)
//   4. Copy the signing secret into FATHOM_WEBHOOK_SECRET on unicron-platform
//      Production / Preview / Development.
//   5. In Fathom, tag the calls Kyle wants ingested with "unicron" (or set
//      FATHOM_TAG_FILTER to whatever convention you prefer).
//
// The exact Fathom payload shape is not contractually stable across plan
// tiers — this handler reads defensively and extracts whichever fields are
// present.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ingestCallTranscript } from '../../../lib/calls-ingest.js';

// ─── Signature verification ───────────────────────────────────────────────────

function timingSafeStringCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function verifyFathomSignature(req: VercelRequest, rawBody: string): boolean {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers['x-fathom-signature'];
  if (typeof provided !== 'string') return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // Accept both raw-hex and "sha256=hex" shapes for compatibility with whatever
  // Fathom ends up sending.
  const candidates = [expected, `sha256=${expected}`];
  return candidates.some((c) => timingSafeStringCompare(c, provided));
}

// ─── Body parsing ─────────────────────────────────────────────────────────────

// Vercel auto-parses JSON when the Content-Type is application/json, but the
// HMAC needs the raw bytes. We disable Vercel's body parser and read manually.
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

// ─── Field extractors ─────────────────────────────────────────────────────────

type FathomPayload = Record<string, unknown> & {
  recording?: Record<string, unknown>;
  meeting?: Record<string, unknown>;
  transcript?: unknown;
  participants?: unknown;
  title?: unknown;
  tags?: unknown;
  date?: unknown;
};

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object' && 'name' in x && typeof (x as { name?: unknown }).name === 'string') {
        return (x as { name: string }).name;
      }
      return null;
    })
    .filter((x): x is string => Boolean(x))
    .map((s) => s.trim());
}

function getTagsLower(p: FathomPayload): string[] {
  return asStringArray(p.tags).map((t) => t.toLowerCase());
}

function getTitle(p: FathomPayload): string | undefined {
  return asString(p.title)
    ?? asString((p.meeting as Record<string, unknown> | undefined)?.title)
    ?? asString((p.recording as Record<string, unknown> | undefined)?.title);
}

function getTranscript(p: FathomPayload): string | undefined {
  if (typeof p.transcript === 'string') return p.transcript;
  if (p.transcript && typeof p.transcript === 'object') {
    const text = (p.transcript as { text?: unknown; full_text?: unknown }).text
      ?? (p.transcript as { text?: unknown; full_text?: unknown }).full_text;
    if (typeof text === 'string') return text;
  }
  const recTranscript = (p.recording as Record<string, unknown> | undefined)?.transcript;
  if (typeof recTranscript === 'string') return recTranscript;
  return undefined;
}

function getParticipants(p: FathomPayload): string[] {
  const direct = asStringArray(p.participants);
  if (direct.length > 0) return direct;
  const meetingP = asStringArray((p.meeting as Record<string, unknown> | undefined)?.participants);
  if (meetingP.length > 0) return meetingP;
  return asStringArray((p.recording as Record<string, unknown> | undefined)?.participants);
}

function getDate(p: FathomPayload): string | undefined {
  const raw = asString(p.date)
    ?? asString((p.meeting as Record<string, unknown> | undefined)?.scheduled_at)
    ?? asString((p.recording as Record<string, unknown> | undefined)?.created_at);
  if (!raw) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : undefined;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  if (!process.env.FATHOM_WEBHOOK_SECRET) {
    // Fail closed when the secret isn't configured. Filing a Bug Fix card to
    // surface the missing env var is the right next step.
    res.status(503).json({ ok: false, error: 'FATHOM_WEBHOOK_SECRET not configured — Fathom ingestion is disabled' });
    return;
  }

  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch {
    res.status(400).json({ ok: false, error: 'failed to read request body' });
    return;
  }

  if (!verifyFathomSignature(req, raw)) {
    res.status(401).json({ ok: false, error: 'invalid Fathom signature' });
    return;
  }

  let payload: FathomPayload;
  try {
    payload = JSON.parse(raw) as FathomPayload;
  } catch {
    res.status(400).json({ ok: false, error: 'body is not valid JSON' });
    return;
  }

  // Tag filter — only ingest calls tagged with the configured marker.
  const tagFilter = (process.env.FATHOM_TAG_FILTER ?? 'unicron').toLowerCase();
  const tags = getTagsLower(payload);
  const title = getTitle(payload) ?? '';
  const matchesTag = tags.includes(tagFilter) || title.toLowerCase().includes(tagFilter);
  if (!matchesTag) {
    res.status(202).json({ ok: true, skipped: true, reason: `tag filter "${tagFilter}" not matched` });
    return;
  }

  const transcript = getTranscript(payload);
  if (!transcript) {
    res.status(400).json({ ok: false, error: 'no transcript present in payload' });
    return;
  }

  try {
    const result = await ingestCallTranscript(
      {
        title,
        transcript,
        date: getDate(payload),
        participants: getParticipants(payload),
        source: 'fathom',
      },
      'fathom_webhook',
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
  verifyFathomSignature,
  getTagsLower,
  getTitle,
  getTranscript,
  getParticipants,
  getDate,
};
