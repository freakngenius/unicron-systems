// lib/agents/boundary.ts — Sprint 7.5 reification
//
// Boundary monitors refusal-layer health: aggregates taboo_block and refusal
// audit_log rows by rule, surfaces rules that haven't fired (potentially
// dead), and reports inactive rules that should perhaps be retired.
// READ-ONLY by design — Boundary itself never mutates the rule table; that
// would defeat the refusal layer it is monitoring. Mutations go through the
// propose-taboo-edit skill instead.
//
// Reads (declared data sources):
//   - nervous_system.taboo_rules           → active/inactive rule inventory
//   - nervous_system.audit_log             → taboo_block + refused entries
// Sink:
//   - vault file at wiki/memory/boundary/<for_date>.md
//   - audit_log row action='boundary_sweep_complete' with counts
//
// Triggered:
//   - Inngest event 'boundary/sweep.run' → boundarySweepRun
//   - HTTP POST /api/atrium/agents/run/boundary

import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BLOCK_ACTIONS = ['taboo_block', 'agent_cockpit_refused'];

export interface BoundarySweepResult {
  forDate: string;
  vaultPath: string;
  vaultStatus: number;
  rule_inventory: {
    active: number;
    inactive: number;
    total: number;
  };
  blocks_window: {
    days: number;
    total: number;
    by_rule: Array<{ rule_name: string; count: number; last_fired_at: string }>;
    by_action: Array<{ action: string; count: number }>;
  };
  dead_rules: Array<{ rule_name: string; action_pattern: string; reason: string }>;
  audit_log_id: string | null;
}

export async function boundarySweep(opts: { forDate?: string; window_days?: number } = {}): Promise<BoundarySweepResult> {
  const now = new Date();
  const forDate = opts.forDate ?? now.toISOString().split('T')[0];
  const windowDays = opts.window_days ?? 30;
  const windowStart = new Date(now.getTime() - windowDays * 24 * 3600 * 1000).toISOString();

  // 1. Rule inventory
  const { data: rules, error: rulesErr } = await supabase
    .schema('nervous_system')
    .from('taboo_rules')
    .select('id, rule_name, action_pattern, active, blocked_reason')
    .order('rule_name', { ascending: true });
  if (rulesErr) console.error('[boundary] taboo_rules:', rulesErr.message);

  const allRules = (rules ?? []) as Array<{ id: string; rule_name: string; action_pattern: string; active: boolean; blocked_reason: string | null }>;
  const activeRules = allRules.filter((r) => r.active);
  const inactiveRules = allRules.filter((r) => !r.active);

  // 2. Block events in window
  const { data: blocks, error: blocksErr } = await supabase
    .schema('nervous_system')
    .from('audit_log')
    .select('action, payload, created_at')
    .in('action', BLOCK_ACTIONS)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(500);
  if (blocksErr) console.error('[boundary] audit_log blocks:', blocksErr.message);

  const blockRows = (blocks ?? []) as Array<{ action: string; payload: Record<string, unknown> | null; created_at: string }>;

  // Aggregate by rule_name
  const byRule = new Map<string, { count: number; last_fired_at: string }>();
  const byAction = new Map<string, number>();
  for (const b of blockRows) {
    byAction.set(b.action, (byAction.get(b.action) ?? 0) + 1);
    let ruleName = (b.payload?.['rule'] ?? b.payload?.['matched_rule']) as string | undefined;
    if (!ruleName && b.payload?.['taboo_result']) {
      const tr = b.payload['taboo_result'] as Record<string, unknown>;
      ruleName = (tr['matched_rule'] as string | undefined);
    }
    const key = ruleName ?? '(no-matched-rule)';
    const existing = byRule.get(key);
    if (existing) {
      existing.count += 1;
      if (b.created_at > existing.last_fired_at) existing.last_fired_at = b.created_at;
    } else {
      byRule.set(key, { count: 1, last_fired_at: b.created_at });
    }
  }
  const by_rule = [...byRule.entries()].map(([rule_name, v]) => ({ rule_name, ...v })).sort((a, b) => b.count - a.count);
  const by_action = [...byAction.entries()].map(([action, count]) => ({ action, count }));

  // Dead rules: active rules that did not fire in the window
  const firedRuleNames = new Set(by_rule.map((r) => r.rule_name));
  const dead_rules = activeRules
    .filter((r) => !firedRuleNames.has(r.rule_name))
    .map((r) => ({ rule_name: r.rule_name, action_pattern: r.action_pattern, reason: `Active rule with no firings in last ${windowDays} days` }));

  // Build report
  const lines: string[] = [];
  lines.push(`# Boundary Sweep — ${forDate}`);
  lines.push('');
  lines.push(`Run timestamp: ${now.toISOString()}`);
  lines.push(`Window: last ${windowDays} days`);
  lines.push('');
  lines.push(`## Rule inventory`);
  lines.push('');
  lines.push(`- Active rules: **${activeRules.length}**`);
  lines.push(`- Inactive rules: **${inactiveRules.length}**`);
  lines.push(`- Total: **${allRules.length}**`);
  lines.push('');
  lines.push(`## Refusal events (last ${windowDays} days): ${blockRows.length} total`);
  lines.push('');
  if (by_action.length > 0) {
    lines.push(`### By action`);
    for (const a of by_action) {
      lines.push(`- \`${a.action}\`: ${a.count}`);
    }
    lines.push('');
  }
  if (by_rule.length > 0) {
    lines.push(`### By rule`);
    for (const r of by_rule.slice(0, 20)) {
      lines.push(`- **${r.rule_name}**: ${r.count} firings, last at \`${r.last_fired_at}\``);
    }
    lines.push('');
  }
  lines.push(`## Active rules with no firings (potential dead-letters)`);
  lines.push('');
  if (dead_rules.length === 0) {
    lines.push('_Every active rule fired at least once in the window._');
  } else {
    for (const d of dead_rules) {
      lines.push(`- \`${d.rule_name}\` (pattern: \`${d.action_pattern}\`)`);
    }
  }
  lines.push('');
  lines.push(`---`);
  lines.push(`_Boundary is read-only. Edits to taboo_rules require a propose-taboo-edit skill run + Kyle approval; no auto-mutation._`);

  const reportMd = lines.join('\n');
  const vaultResult = await writeAgentMemory('boundary', reportMd, forDate);

  let audit_log_id: string | null = null;
  try {
    const { data: row, error } = await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'nervous_system.agents',
        action: 'boundary_sweep_complete',
        payload: {
          for_date: forDate,
          vault_path: vaultResult.path,
          vault_status: vaultResult.status,
          window_days: windowDays,
          active_rules: activeRules.length,
          inactive_rules: inactiveRules.length,
          total_blocks: blockRows.length,
          dead_rule_count: dead_rules.length,
        },
      })
      .select('id')
      .single();
    if (error) console.error('[boundary] audit_log:', error.message);
    else if (row) audit_log_id = row.id as string;
  } catch (err) {
    console.error('[boundary] audit_log threw:', err instanceof Error ? err.message : err);
  }

  return {
    forDate,
    vaultPath: vaultResult.path,
    vaultStatus: vaultResult.status,
    rule_inventory: {
      active: activeRules.length,
      inactive: inactiveRules.length,
      total: allRules.length,
    },
    blocks_window: {
      days: windowDays,
      total: blockRows.length,
      by_rule: by_rule.slice(0, 10),
      by_action,
    },
    dead_rules,
    audit_log_id,
  };
}
