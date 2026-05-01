// lib/email/webhooks.ts — Stream B Gate B3.
//
// Pure parsers for Gmail Pub/Sub push payloads and Microsoft Graph
// change-notification payloads. Returns a normalized {provider,
// providerThreadId, ...} shape that lib/email/threads.ts:handleInboundReply
// consumes.
//
// Provider payload references:
//   Gmail Pub/Sub push: {
//     "message": {
//       "data": base64({ "emailAddress": "...", "historyId": "..." }),
//       "messageId": "...", "publishTime": "..."
//     },
//     "subscription": "projects/.../subscriptions/..."
//   }
//   The Pub/Sub push contains historyId only — the consumer must call
//   gmail.users.history.list to learn what changed. Resolving the actual
//   message + thread requires the operator's access_token. For Phase 2
//   we keep the parser minimal (decode the historyId + email address)
//   and let the orchestrator decide whether to fetch history or skip.
//
//   Microsoft Graph change notification: {
//     "value": [{
//       "subscriptionId": "...",
//       "clientState": "...",
//       "resource": "Users/.../Messages/<id>",
//       "resourceData": { "id": "<message-id>", "@odata.type": "#Microsoft.Graph.Message" },
//       "changeType": "created"
//     }]
//   }
//   Subscription registration uses a validation handshake: GET / POST
//   with `?validationToken=...` — the route returns the token verbatim.

import type { EmailProvider } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Normalized output
// ────────────────────────────────────────────────────────────────────────

export interface NormalizedInbound {
  provider: EmailProvider;
  providerThreadId: string;
  providerMessageId: string | null;
  fromEmail: string | null;
  snippet: string | null;
  receivedAt: string | null;
  // Provider-specific raw fields the orchestrator may need (e.g. Gmail
  // historyId for follow-up fetch).
  raw: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────
// Microsoft Graph
// ────────────────────────────────────────────────────────────────────────

interface GraphChangeNotification {
  value?: Array<{
    subscriptionId?: string;
    clientState?: string;
    resource?: string;
    resourceData?: { id?: string; '@odata.type'?: string };
    changeType?: string;
    subscriptionExpirationDateTime?: string;
  }>;
}

// Body shape on the validation handshake (GET request, no body, or POST
// with validationToken in query). We expose a separate parseValidation
// to make the route flow obvious.
export function parseGraphValidationToken(url: URL): string | null {
  const token = url.searchParams.get('validationToken');
  return token && typeof token === 'string' ? token : null;
}

export function isGraphChangeNotification(value: unknown): value is GraphChangeNotification {
  if (!value || typeof value !== 'object') return false;
  return Array.isArray((value as { value?: unknown }).value);
}

export interface GraphParsedNotification {
  subscriptionId: string | null;
  clientState: string | null;
  messageId: string | null;
  changeType: string | null;
}

export function parseGraphNotifications(
  body: unknown,
): GraphParsedNotification[] {
  if (!isGraphChangeNotification(body)) return [];
  const out: GraphParsedNotification[] = [];
  for (const n of body.value ?? []) {
    out.push({
      subscriptionId: n.subscriptionId ?? null,
      clientState: n.clientState ?? null,
      messageId: n.resourceData?.id ?? extractMessageIdFromResource(n.resource ?? null),
      changeType: n.changeType ?? null,
    });
  }
  return out;
}

function extractMessageIdFromResource(resource: string | null): string | null {
  if (!resource) return null;
  // Resource format: "Users/<userId>/Messages/<messageId>" or
  // "users/<userId>/messages/<messageId>".
  const m = resource.match(/[Mm]essages\/([^/]+)/);
  return m ? m[1] : null;
}

// ────────────────────────────────────────────────────────────────────────
// Gmail Pub/Sub
// ────────────────────────────────────────────────────────────────────────

interface GmailPushBody {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

export interface GmailPushDecoded {
  emailAddress: string | null;
  historyId: string | null;
  messageId: string | null;
  publishTime: string | null;
}

export function parseGmailPush(body: unknown): GmailPushDecoded | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as GmailPushBody;
  const data = b.message?.data;
  if (!data) return null;
  try {
    const decoded = Buffer.from(data, 'base64').toString('utf8');
    const json = JSON.parse(decoded) as { emailAddress?: string; historyId?: string };
    return {
      emailAddress: json.emailAddress ?? null,
      historyId: json.historyId ?? null,
      messageId: b.message?.messageId ?? null,
      publishTime: b.message?.publishTime ?? null,
    };
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Generic normalized webhook (operator-agnostic bridge)
//
// Bridges (n8n, Pipedream, Zapier) can normalize provider payloads
// upstream and post the simpler shape directly to /api/email/webhooks/inbound.
// Useful when the operator doesn't want to wire Pub/Sub end-to-end.
// ────────────────────────────────────────────────────────────────────────

interface GenericInboundBody {
  provider?: string;
  thread_id?: string;
  message_id?: string;
  from_email?: string;
  snippet?: string;
  received_at?: string;
}

export function parseGenericInbound(body: unknown): NormalizedInbound | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as GenericInboundBody;
  if (b.provider !== 'gmail' && b.provider !== 'outlook') return null;
  if (!b.thread_id || typeof b.thread_id !== 'string') return null;
  return {
    provider: b.provider,
    providerThreadId: b.thread_id,
    providerMessageId: typeof b.message_id === 'string' ? b.message_id : null,
    fromEmail: typeof b.from_email === 'string' ? b.from_email : null,
    snippet: typeof b.snippet === 'string' ? b.snippet : null,
    receivedAt: typeof b.received_at === 'string' ? b.received_at : null,
    raw: b as unknown as Record<string, unknown>,
  };
}
