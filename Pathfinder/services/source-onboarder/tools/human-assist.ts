// services/source-onboarder/tools/human-assist.ts
//
// Writes pathfinder.architect_inbox rows for sources Source Onboarder cannot
// onboard autonomously. Spec §8 — ticket schema.

import { supabaseAdmin } from '@/lib/supabase';

export type BlockedReason =
  | 'auth_required'
  | 'js_rendering'
  | 'format_unrecognized'
  | 'rate_limited'
  | 'paid_only'
  | 'pdf_inconsistent'
  | 'no_digital_exposure'
  | 'cost_overrun'
  | 'time_overrun'
  | 'other';

export interface CreateHumanAssistTicketArgs {
  candidateUrl: string;
  blockedReason: BlockedReason;
  blockedDetail: string;
  whatHumanNeedsToDo: string;
  partialProgress?: Record<string, unknown>;
  context?: Record<string, unknown>;
  agentSessionId?: string | null;
  dataSourceId?: string | null;
  priority?: 'low' | 'medium' | 'high';
  category?: 'source-discovery' | 'coverage-expansion';
}

export async function createHumanAssistTicket(args: CreateHumanAssistTicketArgs): Promise<{ ticketId: string }> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>[]) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const result = await sb
    .from('architect_inbox')
    .insert([
      {
        category: args.category ?? 'source-discovery',
        title: `Source needs assist: ${args.candidateUrl}`,
        blocked_reason: args.blockedReason,
        blocked_detail: args.blockedDetail,
        what_human_needs_to_do: args.whatHumanNeedsToDo,
        partial_progress: args.partialProgress ?? null,
        context: { ...(args.context ?? {}), candidate_url: args.candidateUrl },
        agent_session_id: args.agentSessionId ?? null,
        data_source_id: args.dataSourceId ?? null,
        priority: args.priority ?? 'medium',
        status: 'open',
      },
    ])
    .select('id')
    .single();
  if (result.error || !result.data) {
    throw new Error(`architect_inbox insert failed: ${result.error?.message ?? 'no row returned'}`);
  }
  return { ticketId: result.data.id };
}
