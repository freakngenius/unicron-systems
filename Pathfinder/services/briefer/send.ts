// services/briefer/send.ts — Demo Polish UX Gate 13W-B.
//
// Send wrapper for the daily intelligence brief. Picks the user's most
// recent active email integration, sends the brief from→to that account
// (the operator emails themselves), and logs the result to
// pathfinder.outreach_sends with type='briefing'. The 13W-A migration
// allows project_id null when type='briefing'.
//
// lib/email/send.ts is plain-text only at present (Content-Type:
// text/plain). We send brief.markdown as the body — Gmail / Outlook
// render it as legible plain text. HTML send extension is deferred to
// a follow-up gate that touches lib/email/send.ts (out of scope here).

import { getActiveIntegration } from '@/lib/email/integrations';
import { sendEmail, type SendArgs } from '@/lib/email/send';
import { supabaseAdmin } from '@/lib/supabase';
import type { DailyBrief, EmailIntegration, EmailProvider } from '@/lib/types';

export interface SendDailyBriefInput {
  userId: string;
  brief: DailyBrief;
  // Optional pre-fetched integration (skip the lookup). When absent, we
  // probe gmail then outlook for the most recent active connection.
  integration?: EmailIntegration | null;
  // Test seams.
  db?: { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  sendImpl?: (args: SendArgs) => Promise<{
    provider_message_id: string | null;
    provider_thread_id: string | null;
  }>;
  fetchImpl?: typeof fetch;
  // Test seam — override integration lookup.
  getIntegration?: (args: {
    actorEmail: string;
    provider: EmailProvider;
  }) => Promise<EmailIntegration | null>;
}

export interface SendDailyBriefResult {
  ok: boolean;
  message_id: string | null;
  error: string | null;
  outreach_send_id: string | null;
  provider: EmailProvider | null;
}

const PROVIDER_PREFERENCE: EmailProvider[] = ['gmail', 'outlook'];

export async function sendDailyBrief(
  input: SendDailyBriefInput,
): Promise<SendDailyBriefResult> {
  const integration =
    input.integration !== undefined
      ? input.integration
      : await pickIntegration(input);

  if (!integration || !integration.access_token) {
    // No active mailbox — don't insert an outreach_sends row. There's
    // nothing to "audit" since we never attempted to send.
    return {
      ok: false,
      message_id: null,
      error: 'no_active_integration',
      outreach_send_id: null,
      provider: integration?.provider ?? null,
    };
  }

  const sender = input.sendImpl ?? sendEmail;
  let messageId: string | null = null;
  let sendError: string | null = null;
  try {
    const res = await sender({
      provider: integration.provider,
      accessToken: integration.access_token,
      fromEmail: integration.account_email,
      toEmail: integration.account_email,
      subject: input.brief.subject,
      body: input.brief.markdown,
      fetchImpl: input.fetchImpl,
    });
    messageId = res.provider_message_id;
  } catch (e) {
    sendError = e instanceof Error ? e.message : String(e);
  }

  const sendRow = await insertOutreachSendRow({
    db: input.db,
    userId: input.userId,
    toEmail: integration.account_email,
    subject: input.brief.subject,
    body: input.brief.markdown,
    provider: integration.provider,
    messageId,
    sendError,
  });

  return {
    ok: sendError === null,
    message_id: messageId,
    error: sendError,
    outreach_send_id: sendRow,
    provider: integration.provider,
  };
}

async function pickIntegration(
  input: SendDailyBriefInput,
): Promise<EmailIntegration | null> {
  const lookup =
    input.getIntegration ??
    (async (args) => getActiveIntegration({ actorEmail: args.actorEmail, provider: args.provider }));
  for (const provider of PROVIDER_PREFERENCE) {
    const i = await lookup({ actorEmail: input.userId, provider });
    if (i && i.access_token) return i;
  }
  return null;
}

async function insertOutreachSendRow(args: {
  db?: { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string;
  toEmail: string;
  subject: string;
  body: string;
  provider: EmailProvider;
  messageId: string | null;
  sendError: string | null;
}): Promise<string | null> {
  const client = (args.db ?? (supabaseAdmin() as unknown as { from: (t: string) => any })) as { // eslint-disable-line @typescript-eslint/no-explicit-any
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const res = await client
    .from('outreach_sends')
    .insert({
      type: 'briefing',
      project_id: null,
      user_id: args.userId,
      to_email: args.toEmail,
      subject: args.subject,
      body: args.body,
      provider: args.provider,
      message_id: args.messageId,
      status: args.sendError ? 'failed' : 'sent',
      error_message: args.sendError,
    })
    .select('id')
    .single();
  if (res.error) {
    // Don't throw — the send may have succeeded; we just lost the audit
    // row. Surface for observability via the cron's error counter.
    return null;
  }
  return (res.data as { id: string } | null)?.id ?? null;
}

export const __test__ = { pickIntegration };
