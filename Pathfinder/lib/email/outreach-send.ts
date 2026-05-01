// lib/email/outreach-send.ts — Stream B Gate B2.
//
// Orchestrator: "send the rep's edited draft via their connected provider
// and capture the diff to outreach_edits". Wires together
// lib/email/integrations.ts (token lookup), lib/email/send.ts (provider
// adapter), lib/email/edits.ts (diff capture), and supabaseAdmin.
//
// On success: writes outreach_edits row with provider IDs + sent_at.
// On failure: writes outreach_edits row with send_error + sent_at=null.
// Either way, the post-Phase-2 reinforcement loop has the diff.

import { captureEdit } from '@/lib/email/edits';
import { getActiveIntegration } from '@/lib/email/integrations';
import { sendEmail } from '@/lib/email/send';
import { supabaseAdmin } from '@/lib/supabase';
import type { EmailProvider, OutreachEdit } from '@/lib/types';

export interface SendOutreachInput {
  projectId: string;
  outreachDraftId?: number | null;
  actorEmail: string;
  provider: EmailProvider;
  draftSubject: string | null;
  draftBody: string;
  sentSubject: string | null;
  sentBody: string;
  recipientEmail: string;
  fetchImpl?: typeof fetch;
}

export interface SendOutreachResult {
  ok: boolean;
  edit: OutreachEdit;
  error?: string;
}

export async function sendOutreach(input: SendOutreachInput): Promise<SendOutreachResult> {
  const integration = await getActiveIntegration({
    actorEmail: input.actorEmail,
    provider: input.provider,
  });
  if (!integration || !integration.access_token) {
    const editRow = await recordEdit({
      ...input,
      sentAt: null,
      providerMessageId: null,
      providerThreadId: null,
      sendError: 'no_active_integration',
    });
    return { ok: false, edit: editRow, error: 'no_active_integration' };
  }

  let providerMessageId: string | null = null;
  let providerThreadId: string | null = null;
  let sendError: string | null = null;

  try {
    const result = await sendEmail({
      provider: input.provider,
      accessToken: integration.access_token,
      fromEmail: integration.account_email,
      toEmail: input.recipientEmail,
      subject: input.sentSubject ?? '',
      body: input.sentBody,
      fetchImpl: input.fetchImpl,
    });
    providerMessageId = result.provider_message_id;
    providerThreadId = result.provider_thread_id;
  } catch (e) {
    sendError = e instanceof Error ? e.message : String(e);
  }

  const editRow = await recordEdit({
    ...input,
    sentAt: sendError ? null : new Date().toISOString(),
    providerMessageId,
    providerThreadId,
    sendError,
  });

  return sendError
    ? { ok: false, edit: editRow, error: sendError }
    : { ok: true, edit: editRow };
}

interface RecordEditArgs extends SendOutreachInput {
  sentAt: string | null;
  providerMessageId: string | null;
  providerThreadId: string | null;
  sendError: string | null;
}

async function recordEdit(args: RecordEditArgs): Promise<OutreachEdit> {
  const editCapture = captureEdit({
    draftBody: args.draftBody,
    sentBody: args.sentBody,
  });

  const insertRow: Record<string, unknown> = {
    outreach_draft_id: args.outreachDraftId ?? null,
    project_id: args.projectId,
    actor_email: args.actorEmail,
    provider: args.provider,
    draft_subject: args.draftSubject ?? null,
    draft_body: args.draftBody,
    sent_subject: args.sentSubject ?? null,
    sent_body: args.sentBody,
    recipient_email: args.recipientEmail,
    provider_message_id: args.providerMessageId,
    provider_thread_id: args.providerThreadId,
    send_error: args.sendError,
    edit_distance: editCapture.edit_distance,
    edit_summary: {
      edit_band: editCapture.edit_band,
      similarity: editCapture.similarity,
      draft_length: editCapture.draft_length,
      sent_length: editCapture.sent_length,
      unchanged: editCapture.unchanged,
    },
    sent_at: args.sentAt,
  };

  const admin = supabaseAdmin();
  const { data, error } = await (admin.from('outreach_edits') as unknown as {
    insert: (row: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{ data: OutreachEdit | null; error: { message: string } | null }>;
      };
    };
  })
    .insert(insertRow)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`recordEdit: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}
