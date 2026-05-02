// lib/connectors/feedback.ts — write helpers for lead_feedback.
//
// Two callers in C-1B:
//   • slash-command /pathfinder feedback   → recordCommandFeedback
//   • events route reaction_added on bot ts → recordReactionFeedback
//
// Both go through the service-role client; reads should be scoped by
// org through the RLS policy in migration 0106.

import { supabaseAdmin } from '@/lib/supabase';

export interface RecordCommandFeedbackArgs {
  customerOrgId: string;
  projectId: string;
  thumb: 'up' | 'down';
  reason?: string | null;
  userExternalId?: string | null;
  connectorId?: string | null;
}

export async function recordCommandFeedback(args: RecordCommandFeedbackArgs): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  const r = await sb.from('lead_feedback').insert({
    customer_org_id: args.customerOrgId,
    project_id: args.projectId,
    thumb: args.thumb,
    reason: args.reason ?? null,
    source: 'slack_command',
    user_external_id: args.userExternalId ?? null,
    connector_id: args.connectorId ?? null,
  });
  if (r.error) throw new Error(`lead_feedback insert (command) failed: ${r.error.message}`);
}

export interface RecordReactionFeedbackArgs {
  customerOrgId: string;
  connectorId: string;
  projectId: string;
  thumb: 'up' | 'down';
  /** Slack message ts the reaction was added to (the bot's lead message). */
  messageTs: string;
  /** Slack user id who reacted. */
  userExternalId: string;
}

/**
 * Idempotent insert — if the unique partial index in 0106 already has a
 * row for this (connector, ts, user, thumb), the insert no-ops. We
 * detect via the duplicate-key error (Postgres SQLSTATE 23505).
 */
export async function recordReactionFeedback(args: RecordReactionFeedbackArgs): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { message: string; code?: string } | null;
      }>;
    };
  };
  const r = await sb.from('lead_feedback').insert({
    customer_org_id: args.customerOrgId,
    project_id: args.projectId,
    thumb: args.thumb,
    source: 'slack_reaction',
    source_external_id: args.messageTs,
    user_external_id: args.userExternalId,
    connector_id: args.connectorId,
  });
  if (r.error) {
    if (r.error.code === '23505') return; // duplicate; idempotent no-op
    throw new Error(`lead_feedback insert (reaction) failed: ${r.error.message}`);
  }
}
