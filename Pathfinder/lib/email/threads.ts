// lib/email/threads.ts — Stream B Gate B3.
//
// Server-side helpers for pathfinder.email_threads + the reply-detection
// orchestration:
//
//   recordOutboundThread  — stamp a thread on a successful send (B2 wires
//                           this from outreach-send.ts).
//   handleInboundReply    — when a webhook delivers a tracked thread's
//                           inbound message, mark replied_at + flip the
//                           deal stage to REPLIED + write deal_activities.
//
// All writes use supabaseAdmin — RLS rejects anon writes.

import { moveDealStage, recordDealActivity } from '@/lib/deals';
import { supabaseAdmin } from '@/lib/supabase';
import type { DealPipelineStage, EmailProvider, EmailThread } from '@/lib/types';

export interface RecordOutboundInput {
  provider: EmailProvider;
  providerThreadId: string;
  projectId: string;
  dealId?: string | null;
  actorEmail: string;
  subject?: string | null;
  recipientEmail: string;
}

export async function recordOutboundThread(
  input: RecordOutboundInput,
): Promise<EmailThread> {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  // Look up an existing row first; upsert will overwrite the seeded
  // subject + recipient if we let it (we want those frozen at first
  // outbound). Two queries; race-tolerant under the unique index.
  const { data: existing } = await admin
    .from('email_threads')
    .select('*')
    .eq('provider', input.provider)
    .eq('provider_thread_id', input.providerThreadId)
    .maybeSingle();

  if (existing) {
    const next = {
      last_outbound_at: now,
      message_count: ((existing as EmailThread).message_count ?? 0) + 1,
      // Preserve subject + recipient from the first outbound; only
      // hydrate when null (defensive).
      subject: (existing as EmailThread).subject ?? input.subject ?? null,
      recipient_email: (existing as EmailThread).recipient_email ?? input.recipientEmail,
      // Backfill deal_id when the original row didn't have one and the
      // current send does.
      deal_id: (existing as EmailThread).deal_id ?? input.dealId ?? null,
    };
    const { data: updated, error } = await (admin.from('email_threads') as unknown as {
      update: (row: Record<string, unknown>) => {
        eq: (
          c1: string,
          v1: string,
        ) => {
          eq: (
            c2: string,
            v2: string,
          ) => {
            select: () => {
              single: () => Promise<{ data: EmailThread | null; error: { message: string } | null }>;
            };
          };
        };
      };
    })
      .update(next)
      .eq('provider', input.provider)
      .eq('provider_thread_id', input.providerThreadId)
      .select()
      .single();
    if (error || !updated) {
      throw new Error(`recordOutboundThread update: ${error?.message ?? 'no row'}`);
    }
    return updated;
  }

  const insertRow: Record<string, unknown> = {
    provider: input.provider,
    provider_thread_id: input.providerThreadId,
    project_id: input.projectId,
    deal_id: input.dealId ?? null,
    actor_email: input.actorEmail,
    subject: input.subject ?? null,
    recipient_email: input.recipientEmail,
    last_outbound_at: now,
    last_inbound_at: null,
    replied_at: null,
    message_count: 1,
  };
  const { data, error } = await (admin.from('email_threads') as unknown as {
    insert: (row: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{ data: EmailThread | null; error: { message: string } | null }>;
      };
    };
  })
    .insert(insertRow)
    .select()
    .single();
  if (error || !data) {
    throw new Error(`recordOutboundThread insert: ${error?.message ?? 'no row'}`);
  }
  return data;
}

// ────────────────────────────────────────────────────────────────────────
// Reply orchestration
// ────────────────────────────────────────────────────────────────────────

// The seven Kanban stages that come BEFORE 'REPLIED'. When a reply lands
// and the deal is in any of these (or no deal exists yet), flip to
// REPLIED. Past-REPLIED stages (MEETING / PROPOSAL / WON / LOST) are
// preserved — a late reply doesn't regress the funnel.
const PRE_REPLIED_STAGES: ReadonlySet<DealPipelineStage> = new Set([
  'NEW',
  'CONTACTED',
]);

export interface HandleInboundInput {
  provider: EmailProvider;
  providerThreadId: string;
  // Optional fields for richer audit-trail; the route writes whatever it
  // can extract from the provider payload.
  providerMessageId?: string | null;
  fromEmail?: string | null;
  snippet?: string | null;
  receivedAt?: string | null;
}

export interface HandleInboundResult {
  matched: boolean;
  thread?: EmailThread;
  dealStageChanged?: DealPipelineStage | null;
  dealActivityRecorded?: boolean;
}

export async function handleInboundReply(
  input: HandleInboundInput,
): Promise<HandleInboundResult> {
  const admin = supabaseAdmin();

  // Lookup the thread (must already exist from outbound seed). If we
  // don't recognize this thread, nothing to do — return matched=false.
  const { data: thread, error: lookupError } = await admin
    .from('email_threads')
    .select('*')
    .eq('provider', input.provider)
    .eq('provider_thread_id', input.providerThreadId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`handleInboundReply lookup: ${lookupError.message}`);
  }
  if (!thread) {
    return { matched: false };
  }

  const t = thread as EmailThread;
  const inboundAt = input.receivedAt ?? new Date().toISOString();
  const isFirstReply = !t.replied_at;

  // Bump thread row.
  const next = {
    last_inbound_at: inboundAt,
    replied_at: t.replied_at ?? inboundAt,
    message_count: t.message_count + 1,
  };
  const { data: updatedThread, error: updateError } = await (admin.from('email_threads') as unknown as {
    update: (row: Record<string, unknown>) => {
      eq: (
        c1: string,
        v1: string,
      ) => {
        eq: (
          c2: string,
          v2: string,
        ) => {
          select: () => {
            single: () => Promise<{ data: EmailThread | null; error: { message: string } | null }>;
          };
        };
      };
    };
  })
    .update(next)
    .eq('provider', input.provider)
    .eq('provider_thread_id', input.providerThreadId)
    .select()
    .single();
  if (updateError || !updatedThread) {
    throw new Error(`handleInboundReply update: ${updateError?.message ?? 'no row'}`);
  }

  let dealStageChanged: DealPipelineStage | null = null;
  let dealActivityRecorded = false;

  if (t.deal_id && isFirstReply) {
    // Read deal stage; flip to REPLIED only when in NEW or CONTACTED.
    const { data: deal } = await admin
      .from('deals')
      .select('id, pipeline_stage')
      .eq('id', t.deal_id)
      .maybeSingle();

    if (deal && PRE_REPLIED_STAGES.has((deal as { pipeline_stage: DealPipelineStage }).pipeline_stage)) {
      const moved = await moveDealStage({
        dealId: t.deal_id,
        toStage: 'REPLIED',
        actorEmail: 'system',
        payload: {
          source: 'reply_detection',
          provider: input.provider,
          provider_thread_id: input.providerThreadId,
          provider_message_id: input.providerMessageId ?? null,
        },
      });
      if (!moved.noop) dealStageChanged = 'REPLIED';
    }

    // Always write a 'reply_received' activity row when we have a deal,
    // even if we didn't change stage (e.g., already past REPLIED). This
    // keeps the timeline complete.
    await recordDealActivity({
      dealId: t.deal_id,
      activityType: 'reply_received',
      payload: {
        provider: input.provider,
        provider_thread_id: input.providerThreadId,
        provider_message_id: input.providerMessageId ?? null,
        from_email: input.fromEmail ?? null,
        snippet: input.snippet ?? null,
      },
      actorEmail: 'system',
    });
    dealActivityRecorded = true;
  }

  return {
    matched: true,
    thread: updatedThread,
    dealStageChanged,
    dealActivityRecorded,
  };
}
