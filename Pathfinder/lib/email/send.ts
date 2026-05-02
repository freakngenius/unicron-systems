// lib/email/send.ts — Stream B Gate B2.
//
// Provider-agnostic send adapter for Gmail (Gmail API) and Outlook
// (Microsoft Graph). Returns the provider message + thread IDs the route
// records into pathfinder.outreach_edits.
//
// No SDKs — both providers expose simple REST endpoints that fetch can
// hit directly. Same approach as lib/hubspot/client.ts.

import type { EmailProvider } from '@/lib/types';

export interface SendArgs {
  provider: EmailProvider;
  accessToken: string;
  // Sender address is the connected mailbox; rendered in the From header.
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  fetchImpl?: typeof fetch;
}

export interface SendResult {
  provider_message_id: string | null;
  provider_thread_id: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// MIME encoder — tiny, no SDK. Both providers want a base64url-encoded
// RFC 5322 message.
// ────────────────────────────────────────────────────────────────────────

export function buildMime(args: { from: string; to: string; subject: string; body: string }): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(args.subject, 'utf8').toString('base64')}?=`;
  // Plain-text only body; Phase 2 leaves HTML send for later.
  const lines = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    args.body,
  ];
  return lines.join('\r\n');
}

// ────────────────────────────────────────────────────────────────────────
// Gmail send
// ────────────────────────────────────────────────────────────────────────

interface GmailSendResponse {
  id?: string;
  threadId?: string;
}

async function sendViaGmail(args: SendArgs): Promise<SendResult> {
  const f = args.fetchImpl ?? fetch;
  const mime = buildMime({
    from: args.fromEmail,
    to: args.toEmail,
    subject: args.subject,
    body: args.body,
  });
  const raw = Buffer.from(mime, 'utf8').toString('base64url');

  const res = await f('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`gmail_send_failed: status=${res.status} ${detail}`);
  }
  const json = (await res.json()) as GmailSendResponse;
  return {
    provider_message_id: json.id ?? null,
    provider_thread_id: json.threadId ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Microsoft Graph send (Outlook)
//
// POST /me/sendMail with `saveToSentItems=true`. Note: sendMail does NOT
// return a message ID in the response; to capture it we follow up with
// /me/messages?$top=1&$orderby=sentDateTime desc and grab the most recent
// sent message. Best-effort — if the lookup fails we still record the
// send with null IDs and the caller can reconcile via webhook (B3).
// ────────────────────────────────────────────────────────────────────────

interface GraphMessageListResponse {
  value?: Array<{ id?: string; conversationId?: string; subject?: string }>;
}

async function sendViaOutlook(args: SendArgs): Promise<SendResult> {
  const f = args.fetchImpl ?? fetch;

  const message = {
    message: {
      subject: args.subject,
      body: { contentType: 'Text', content: args.body },
      toRecipients: [{ emailAddress: { address: args.toEmail } }],
    },
    saveToSentItems: true,
  };

  const res = await f('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  if (res.status !== 202) {
    const detail = await res.text().catch(() => '');
    throw new Error(`outlook_send_failed: status=${res.status} ${detail}`);
  }

  // Best-effort lookup of the just-sent message ID.
  try {
    const list = await f(
      `https://graph.microsoft.com/v1.0/me/mailFolders('SentItems')/messages?$top=1&$orderby=sentDateTime desc&$select=id,conversationId,subject`,
      { headers: { authorization: `Bearer ${args.accessToken}` } },
    );
    if (list.ok) {
      const json = (await list.json()) as GraphMessageListResponse;
      const first = json.value?.[0];
      if (first && first.subject === args.subject) {
        return {
          provider_message_id: first.id ?? null,
          provider_thread_id: first.conversationId ?? null,
        };
      }
    }
  } catch {
    // ignore — we'll return null IDs
  }
  return { provider_message_id: null, provider_thread_id: null };
}

// ────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (args.provider === 'gmail') return sendViaGmail(args);
  if (args.provider === 'outlook') return sendViaOutlook(args);
  // exhaustiveness — should be impossible at runtime
  const exhaustive: never = args.provider;
  throw new Error(`unknown_provider: ${exhaustive as string}`);
}
