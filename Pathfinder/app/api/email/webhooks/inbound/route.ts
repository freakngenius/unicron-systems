// POST /api/email/webhooks/inbound
//
// Stream B Gate B3 — generic normalized inbound webhook. Used by
// operator bridges (n8n, Zapier) that pre-translate Gmail / Graph
// payloads to a simpler shape:
//
//   { provider: 'gmail' | 'outlook', thread_id: string,
//     message_id?: string, from_email?: string, snippet?: string,
//     received_at?: string }
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (same internal-call gate
// as app/api/cron/* and app/api/hubspot/push-deal). Bridges sign with
// the shared secret.

import { NextResponse } from 'next/server';

import { handleInboundReply } from '@/lib/email/threads';
import { parseGenericInbound } from '@/lib/email/webhooks';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() === expected;
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('secret');
    if (q && q === expected) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = parseGenericInbound(raw);
  if (!parsed) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  try {
    const result = await handleInboundReply({
      provider: parsed.provider,
      providerThreadId: parsed.providerThreadId,
      providerMessageId: parsed.providerMessageId,
      fromEmail: parsed.fromEmail,
      snippet: parsed.snippet,
      receivedAt: parsed.receivedAt,
    });
    return NextResponse.json(result);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
