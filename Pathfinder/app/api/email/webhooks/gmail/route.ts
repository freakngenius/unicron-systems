// POST /api/email/webhooks/gmail
//
// Stream B Gate B3 — Gmail Pub/Sub push receiver. Cloud Pub/Sub posts a
// payload like:
//
//   { "message": { "data": base64({ emailAddress, historyId }),
//                  "messageId": "...", "publishTime": "..." },
//     "subscription": "projects/.../subscriptions/..." }
//
// The notification only carries a historyId — to learn what changed we
// must call gmail.users.history.list. That requires the operator's
// stored access_token. If we can't resolve a thread, we record the
// historyId for diagnostic logs and respond 200 (Pub/Sub treats non-2xx
// as redeliverable).
//
// Auth: Pub/Sub push can be authenticated by JWT in the Authorization
// header (production setup). For v1 we gate on `?secret=CRON_SECRET`
// and EMAIL_WEBHOOK_DEFAULT_OPERATOR. The operator wires the Pub/Sub
// subscription with the secret query param when creating the push
// endpoint.

import { NextResponse, type NextRequest } from 'next/server';

import { getActiveIntegration } from '@/lib/email/integrations';
import { handleInboundReply } from '@/lib/email/threads';
import { parseGmailPush } from '@/lib/email/webhooks';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const url = new URL(req.url);
  const q = url.searchParams.get('secret');
  if (q && q === expected) return true;
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() === expected;
  }
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const decoded = parseGmailPush(raw);
  if (!decoded) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  if (!decoded.historyId || !decoded.emailAddress) {
    return NextResponse.json({ matched: 0, reason: 'incomplete_decoded' });
  }

  const operator = process.env.EMAIL_WEBHOOK_DEFAULT_OPERATOR ?? null;
  if (!operator) {
    return NextResponse.json({ matched: 0, reason: 'no_default_operator' });
  }

  const integration = await getActiveIntegration({
    actorEmail: operator,
    provider: 'gmail',
  });
  if (!integration?.access_token) {
    return NextResponse.json({ matched: 0, reason: 'no_active_integration' });
  }

  // Fetch history since this historyId; collect (threadId, messageId)
  // pairs for messagesAdded. Best-effort.
  let threadIds: Array<{ threadId: string; messageId: string }> = [];
  try {
    const historyUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(decoded.emailAddress)}/history`,
    );
    historyUrl.searchParams.set('startHistoryId', decoded.historyId);
    historyUrl.searchParams.set('historyTypes', 'messageAdded');
    const res = await fetch(historyUrl.toString(), {
      headers: { authorization: `Bearer ${integration.access_token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as {
        history?: Array<{
          messagesAdded?: Array<{
            message?: { id?: string; threadId?: string; labelIds?: string[] };
          }>;
        }>;
      };
      for (const entry of json.history ?? []) {
        for (const m of entry.messagesAdded ?? []) {
          const labels = m.message?.labelIds ?? [];
          // Skip the rep's own outbound — we only care about inbound.
          if (labels.includes('SENT')) continue;
          if (m.message?.threadId && m.message.id) {
            threadIds.push({ threadId: m.message.threadId, messageId: m.message.id });
          }
        }
      }
    }
  } catch {
    // ignore — we'll respond with 0 matches
  }

  const results: Array<{ matched: boolean; threadId: string }> = [];
  for (const t of threadIds) {
    try {
      const r = await handleInboundReply({
        provider: 'gmail',
        providerThreadId: t.threadId,
        providerMessageId: t.messageId,
      });
      results.push({ matched: r.matched, threadId: t.threadId });
    } catch (e) {
      results.push({ matched: false, threadId: t.threadId });
      // Log via console — recorder telemetry would catch it in Axiom.
      console.error('gmail webhook handleInboundReply failed', e);
    }
  }
  return NextResponse.json({ matched: results.filter((r) => r.matched).length, results });
}
