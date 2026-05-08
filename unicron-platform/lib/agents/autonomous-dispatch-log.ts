// lib/agents/autonomous-dispatch-log.ts — Sprint 3 Stream C
// Writes audit_log rows for every Orchestrator tool dispatch.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function logToolDispatch(params: {
  toolName: string;
  inputSummary: string;
  resultSummary: string;
  requestedByMemberId: string;
  autonomous: boolean;
  tabooPassed: boolean;
  tabooReason?: string;
}): Promise<void> {
  await supabase.from('audit_log').insert({
    table_name: 'agents',
    action: 'orchestrator_tool_dispatch',
    actor_id: params.requestedByMemberId,
    payload: {
      tool_name: params.toolName,
      input_summary: params.inputSummary.slice(0, 200),
      result_summary: params.resultSummary.slice(0, 200),
      autonomous: params.autonomous,
      taboo_passed: params.tabooPassed,
      taboo_reason: params.tabooReason,
    },
  });
}
