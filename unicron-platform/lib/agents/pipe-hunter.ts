// lib/agents/pipe-hunter.ts — Sprint 7.5 reification
// Pipe Hunter scans pathfinder.adjacent_targets, surfaces candidates that
// don't yet have a corresponding lead_action, and writes adjacency proposals
// to the ledger for Architect to triage.

import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface AdjacentTargetRow {
  id: number;
  company_name: string;
  geography: string | null;
  branch_count_estimate: number | null;
  shape_match_reason: string | null;
  outreach_draft: string | null;
  surfaced_at: string;
}

export interface PipeHunterResult {
  forDate: string;
  vaultPath: string;
  vaultStatus: number;
  total_targets: number;
  new_proposals: number;
  proposals: Array<{ company_name: string; geography: string | null; branch_count: number | null; ledger_id: string | null }>;
  audit_log_id: string | null;
}

export async function pipeHunterRun(opts: { forDate?: string } = {}): Promise<PipeHunterResult> {
  const now = new Date();
  const forDate = opts.forDate ?? now.toISOString().split('T')[0];

  // 1. Pull adjacent targets surfaced in last 90 days
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
  const { data: targetsRaw, error } = await supabase
    .schema('pathfinder')
    .from('adjacent_targets')
    .select('id, company_name, geography, branch_count_estimate, shape_match_reason, outreach_draft, surfaced_at')
    .gte('surfaced_at', ninetyDaysAgo)
    .order('surfaced_at', { ascending: false })
    .limit(200);
  if (error) console.error('[pipe-hunter] adjacent_targets:', error.message);
  const targets = (targetsRaw ?? []) as AdjacentTargetRow[];

  // 2. For each, check if an adjacency_proposal ledger row already exists
  //    (idempotent via source_id = pipe_hunter::<target_id>)
  const proposals: PipeHunterResult['proposals'] = [];
  let new_proposals = 0;
  for (const t of targets) {
    const sourceId = `pipe_hunter::adjacent::${t.id}`;
    const { data: existing } = await supabase
      .schema('nervous_system')
      .from('ledger')
      .select('id')
      .eq('source_id', sourceId)
      .limit(1);
    if (existing && existing.length > 0) {
      proposals.push({ company_name: t.company_name, geography: t.geography, branch_count: t.branch_count_estimate, ledger_id: existing[0].id as string });
      continue;
    }
    const insert = await supabase
      .schema('nervous_system')
      .from('ledger')
      .insert({
        source_type: 'adjacency_proposal',
        source_id: sourceId,
        content_summary: `Adjacency proposal: ${t.company_name}${t.geography ? ' (' + t.geography.split(',')[0] + ')' : ''}`,
        content_full: [
          `Company: ${t.company_name}`,
          t.geography ? `Geography: ${t.geography}` : null,
          t.branch_count_estimate ? `Branches: ~${t.branch_count_estimate}` : null,
          t.shape_match_reason ? `Shape match: ${t.shape_match_reason}` : null,
          t.outreach_draft ? `\nDraft outreach:\n${t.outreach_draft}` : null,
        ].filter(Boolean).join('\n'),
        insights: {
          adjacent_target_id: t.id,
          company_name: t.company_name,
          geography: t.geography,
          branch_count: t.branch_count_estimate,
          surfaced_at: t.surfaced_at,
          architect_action_required: 'review_and_propose',
        },
        strength: 0.5,
        ttl_days: 60,
      })
      .select('id')
      .single();
    if (insert.error) {
      console.error('[pipe-hunter] ledger insert:', insert.error.message);
      proposals.push({ company_name: t.company_name, geography: t.geography, branch_count: t.branch_count_estimate, ledger_id: null });
      continue;
    }
    new_proposals += 1;
    proposals.push({ company_name: t.company_name, geography: t.geography, branch_count: t.branch_count_estimate, ledger_id: insert.data?.id as string ?? null });
  }

  // 3. Build report
  const lines: string[] = [];
  lines.push(`# Pipe Hunter — ${forDate}`);
  lines.push('');
  lines.push(`Run timestamp: ${now.toISOString()}`);
  lines.push(`Source: pathfinder.adjacent_targets (surfaced in last 90 days)`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- Adjacent targets reviewed: **${targets.length}**`);
  lines.push(`- New adjacency_proposal ledger rows: **${new_proposals}**`);
  lines.push(`- Existing proposals (already in ledger): **${proposals.length - new_proposals}**`);
  lines.push('');
  if (proposals.length > 0) {
    lines.push(`## Proposals`);
    lines.push('');
    for (const p of proposals.slice(0, 30)) {
      lines.push(`- **${p.company_name}**${p.geography ? ` — ${p.geography.split(',')[0]}` : ''}${p.branch_count ? ` (~${p.branch_count} branches)` : ''} → ledger \`${p.ledger_id ?? '(none)'}\``);
    }
  }
  lines.push('');
  lines.push(`---`);
  lines.push(`_Pipe Hunter surfaces; Architect proposes; operator approves. No auto-outreach._`);

  const reportMd = lines.join('\n');
  const vaultResult = await writeAgentMemory('pipe-hunter', reportMd, forDate);

  let audit_log_id: string | null = null;
  try {
    const { data: row, error: auditErr } = await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'nervous_system.agents',
        action: 'pipe_hunter_run_complete',
        payload: {
          for_date: forDate,
          vault_path: vaultResult.path,
          vault_status: vaultResult.status,
          total_targets: targets.length,
          new_proposals,
          existing_proposals: proposals.length - new_proposals,
        },
      })
      .select('id')
      .single();
    if (auditErr) console.error('[pipe-hunter] audit_log:', auditErr.message);
    else if (row) audit_log_id = row.id as string;
  } catch (err) {
    console.error('[pipe-hunter] audit_log threw:', err instanceof Error ? err.message : err);
  }

  return {
    forDate,
    vaultPath: vaultResult.path,
    vaultStatus: vaultResult.status,
    total_targets: targets.length,
    new_proposals,
    proposals: proposals.slice(0, 10),
    audit_log_id,
  };
}
