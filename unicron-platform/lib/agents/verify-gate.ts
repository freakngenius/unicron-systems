// lib/agents/verify-gate.ts — Sprint 3 Stream B
// Checks action items before kanban card moves toward Deployed.
// If priority = 'irreversible', consults the Elder and writes an audit log entry.

import { createClient } from '@supabase/supabase-js';
import { elderAdvise } from './elder.js';
import type { ElderAdvisory } from './elder.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface VerifyGateResult {
  allowed: boolean;
  reason?: string;
  elder_advisory?: ElderAdvisory;
  block_until_override: boolean;
}

interface ActionItemRow {
  title: string;
  description: string | null;
  priority: string;
  status: string;
}

/**
 * Run the verify gate for a kanban card before moving to Deployed.
 * If priority = 'irreversible', consults the Elder.
 */
export async function runVerifyGate(actionItemId: string): Promise<VerifyGateResult> {
  const { data: item } = await supabase
    .from('action_items')
    .select('title, description, priority, status')
    .eq('id', actionItemId)
    .single<ActionItemRow>();

  if (!item) {
    return { allowed: false, reason: 'Action item not found', block_until_override: false };
  }

  if (item.priority !== 'irreversible') {
    return { allowed: true, block_until_override: false };
  }

  // Irreversible — consult Elder
  const advisory = await elderAdvise(
    'kanban_deploy',
    `action_item:${actionItemId}`,
    `${item.title}: ${item.description ?? ''}`
  );

  // Write audit log
  await supabase.from('audit_log').insert({
    table_name: 'action_items',
    action: 'elder_consulted',
    actor_id: null,
    payload: { action_item_id: actionItemId, advisory },
  });

  if (advisory.flag === 'requires_explicit_override') {
    return {
      allowed: false,
      reason: `Elder requires explicit override: ${advisory.notes}`,
      elder_advisory: advisory,
      block_until_override: true,
    };
  }

  return { allowed: true, elder_advisory: advisory, block_until_override: false };
}
