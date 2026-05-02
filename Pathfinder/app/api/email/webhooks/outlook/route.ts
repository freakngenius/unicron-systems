// POST/GET /api/email/webhooks/outlook
//
// Stream B Gate B3 — Microsoft Graph change-notification webhook for
// Outlook reply detection. Handles two flows:
//
//   1. Validation handshake: Graph posts/gets with ?validationToken=...
//      and expects the token verbatim with `text/plain` content-type.
//      Must respond within 10 seconds for the subscription to register.
//
//   2. Change notification: POST with { value: [...] }. Each notification
//      carries a clientState we match against EMAIL_GRAPH_CLIENT_STATE
//      (operator-set shared secret). For each created-message
//      notification we fetch the message via Graph (best-effort) and
//      forward the threadId to handleInboundReply.

import { NextResponse, type NextRequest } from 'next/server';

import { getActiveIntegration } from '@/lib/email/integrations';
import { handleInboundReply } from '@/lib/email/threads';
import { parseGraphNotifications, parseGraphValidationToken } from '@/lib/email/webhooks';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function expectedClientState(): string | null {
  return process.env.EMAIL_GRAPH_CLIENT_STATE ?? null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = parseGraphValidationToken(url);
  if (token) {
    return new NextResponse(token, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }
  return NextResponse.json({ error: 'missing_validation_token' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  // Validation handshake also arrives as POST in some Graph configurations.
  const url = new URL(req.url);
  const validationToken = parseGraphValidationToken(url);
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const expected = expectedClientState();
  const notifications = parseGraphNotifications(raw);
  if (notifications.length === 0) {
    return NextResponse.json({ matched: 0, results: [] });
  }

  const results: Array<{ matched: boolean; messageId: string | null; reason?: string }> = [];

  for (const n of notifications) {
    if (expected && n.clientState !== expected) {
      results.push({ matched: false, messageId: n.messageId, reason: 'invalid_client_state' });
      continue;
    }
    if (n.changeType !== 'created' && n.changeType !== 'updated') {
      results.push({ matched: false, messageId: n.messageId, reason: 'ignored_change_type' });
      continue;
    }
    if (!n.messageId) {
      results.push({ matched: false, messageId: null, reason: 'no_message_id' });
      continue;
    }

    // Fetch the message to learn its conversationId. Graph webhooks
    // don't include the threadId in the notification body. We use the
    // operator's stored token; if no integration exists on this server,
    // we can still record the event for the bridge fallback path.
    try {
      const fetched = await fetchGraphMessage(n.messageId);
      if (!fetched) {
        results.push({ matched: false, messageId: n.messageId, reason: 'cannot_fetch_message' });
        continue;
      }
      const result = await handleInboundReply({
        provider: 'outlook',
        providerThreadId: fetched.conversationId,
        providerMessageId: n.messageId,
        fromEmail: fetched.fromEmail,
        snippet: fetched.snippet,
        receivedAt: fetched.receivedAt,
      });
      results.push({ matched: result.matched, messageId: n.messageId });
    } catch (e) {
      results.push({
        matched: false,
        messageId: n.messageId,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return NextResponse.json({ results });
}

interface FetchedGraphMessage {
  conversationId: string;
  fromEmail: string | null;
  snippet: string | null;
  receivedAt: string | null;
}

async function fetchGraphMessage(messageId: string): Promise<FetchedGraphMessage | null> {
  // Walk the connected Outlook integrations until one of them can
  // resolve the message. Best-effort — multi-tenant resolution would
  // need a tenant→integration index in Phase 3.
  // For now this works because Pathfinder is single-tenant (Zedcor).
  // If no integration exists, return null and the route records the
  // event without dispatching to handleInboundReply.

  // Pull any non-disconnected outlook integration. We don't know the
  // actor a priori from the notification.
  try {
    // We can't enumerate without an actor; if the operator must wire
    // this exactly, EMAIL_WEBHOOK_DEFAULT_OPERATOR points at the inbox.
    const operator = process.env.EMAIL_WEBHOOK_DEFAULT_OPERATOR ?? null;
    if (!operator) return null;
    const integration = await getActiveIntegration({
      actorEmail: operator,
      provider: 'outlook',
    });
    if (!integration?.access_token) return null;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,from,subject,bodyPreview,receivedDateTime`,
      { headers: { authorization: `Bearer ${integration.access_token}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      conversationId?: string;
      from?: { emailAddress?: { address?: string } };
      bodyPreview?: string;
      receivedDateTime?: string;
    };
    if (!json.conversationId) return null;
    return {
      conversationId: json.conversationId,
      fromEmail: json.from?.emailAddress?.address ?? null,
      snippet: json.bodyPreview ?? null,
      receivedAt: json.receivedDateTime ?? null,
    };
  } catch {
    return null;
  }
}
