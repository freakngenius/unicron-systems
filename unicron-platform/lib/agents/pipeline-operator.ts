// lib/agents/pipeline-operator.ts — Sprint 7.5 reification
// Pipeline Operator runs activity-based pipeline ops over pathfinder.lead_actions:
// surfaces stale projects (demote candidates) and recently-active ones
// (promote candidates), writes daily snapshot + ledger event.

import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface LeadActionRow {
  id: number;
  project_id: string;
  actor_email: string | null;
  status: string | null;
  attested_pipeline_value: number | null;
  first_action_date: string | null;
  hubspot_last_event_at: string | null;
  hubspot_pushed_at: string | null;
}

export interface PipelineOperatorResult {
  forDate: string;
  vaultPath: string;
  vaultStatus: number;
  total_actions: number;
  by_status: Array<{ status: string; count: number }>;
  promote_candidates: Array<{ project_id: string; status: string; last_activity: string }>;
  demote_candidates: Array<{ project_id: string; status: string; first_action_date: string | null; last_activity: string | null }>;
  ledger_id: string | null;
  audit_log_id: string | null;
}

function projectLastActivity(rows: LeadActionRow[]): string | null {
  const candidates: string[] = [];
  for (const r of rows) {
    if (r.hubspot_last_event_at) candidates.push(r.hubspot_last_event_at);
    if (r.hubspot_pushed_at) candidates.push(r.hubspot_pushed_at);
    if (r.first_action_date) candidates.push(`${r.first_action_date}T00:00:00Z`);
  }
  if (candidates.length === 0) return null;
  candidates.sort();
  return candidates[candidates.length - 1];
}

export async function pipelineOperatorRun(opts: { forDate?: string } = {}): Promise<PipelineOperatorResult> {
  const now = new Date();
  const forDate = opts.forDate ?? now.toISOString().split('T')[0];

  const { data, error } = await supabase
    .schema('pathfinder')
    .from('lead_actions')
    .select('id, project_id, actor_email, status, attested_pipeline_value, first_action_date, hubspot_last_event_at, hubspot_pushed_at')
    .order('id', { ascending: false })
    .limit(2000);
  if (error) console.error('[pipeline-operator] lead_actions:', error.message);
  const rows = (data ?? []) as LeadActionRow[];

  const byStatus = new Map<string, number>();
  const byProject = new Map<string, LeadActionRow[]>();
  for (const r of rows) {
    byStatus.set(r.status ?? '(null)', (byStatus.get(r.status ?? '(null)') ?? 0) + 1);
    const proj = byProject.get(r.project_id) ?? [];
    proj.push(r);
    byProject.set(r.project_id, proj);
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const promote: PipelineOperatorResult['promote_candidates'] = [];
  const demote: PipelineOperatorResult['demote_candidates'] = [];
  for (const [project_id, projRows] of byProject.entries()) {
    const lastActivity = projectLastActivity(projRows);
    const latestStatus = projRows[0]?.status ?? '(null)';
    if (lastActivity && new Date(lastActivity) >= sevenDaysAgo) {
      promote.push({ project_id, status: latestStatus, last_activity: lastActivity });
    } else if (!lastActivity || new Date(lastActivity) < thirtyDaysAgo) {
      demote.push({ project_id, status: latestStatus, first_action_date: projRows[0]?.first_action_date ?? null, last_activity: lastActivity });
    }
  }

  const lines: string[] = [];
  lines.push(`# Pipeline Operator — ${forDate}`);
  lines.push('');
  lines.push(`Run timestamp: ${now.toISOString()}`);
  lines.push(`Source: pathfinder.lead_actions (last 2000 rows)`);
  lines.push('');
  lines.push(`## Activity summary`);
  lines.push('');
  lines.push(`- Total lead_actions: **${rows.length}**`);
  lines.push(`- Distinct projects: **${byProject.size}**`);
  for (const [status, count] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- status \`${status}\`: ${count}`);
  }
  lines.push('');
  lines.push(`## Promote candidates (active in last 7d) — ${promote.length}`);
  lines.push('');
  if (promote.length === 0) lines.push('_No projects with activity in the last 7 days._');
  else for (const p of promote.slice(0, 20)) lines.push(`- \`${p.project_id}\` [${p.status}] last_activity=${p.last_activity}`);
  lines.push('');
  lines.push(`## Demote candidates (no activity in 30+ days or never) — ${demote.length}`);
  lines.push('');
  if (demote.length === 0) lines.push('_No demote candidates._');
  else for (const d of demote.slice(0, 20)) lines.push(`- \`${d.project_id}\` [${d.status}] first_action=${d.first_action_date ?? 'null'} last_activity=${d.last_activity ?? 'never'}`);
  lines.push('');
  lines.push(`---`);
  lines.push(`_Operator surfaces candidates only; actual pipeline-stage mutation goes through pathfinder UI / HubSpot — no auto-promote._`);

  const reportMd = lines.join('\n');
  const vaultResult = await writeAgentMemory('pipeline-operator', reportMd, forDate);

  let ledger_id: string | null = null;
  const ledgerInsert = await supabase
    .schema('nervous_system')
    .from('ledger')
    .insert({
      source_type: 'pipeline_event',
      source_id: `pipeline_operator::${forDate}`,
      content_summary: `Pipeline daily ${forDate}: ${promote.length} promote, ${demote.length} demote candidates across ${byProject.size} projects`,
      content_full: null,
      insights: {
        for_date: forDate,
        total_actions: rows.length,
        distinct_projects: byProject.size,
        by_status: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
        promote_project_ids: promote.slice(0, 50).map((p) => p.project_id),
        demote_project_ids: demote.slice(0, 50).map((d) => d.project_id),
        vault_path: vaultResult.path,
      },
      strength: 0.5,
      ttl_days: 14,
    })
    .select('id')
    .single();
  if (ledgerInsert.error) console.error('[pipeline-operator] ledger insert:', ledgerInsert.error.message);
  else if (ledgerInsert.data) ledger_id = ledgerInsert.data.id as string;

  let audit_log_id: string | null = null;
  try {
    const { data: row, error: auditErr } = await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'nervous_system.agents',
        action: 'pipeline_operator_run_complete',
        payload: { for_date: forDate, vault_path: vaultResult.path, vault_status: vaultResult.status, total_actions: rows.length, distinct_projects: byProject.size, promote_count: promote.length, demote_count: demote.length, ledger_id },
      })
      .select('id')
      .single();
    if (auditErr) console.error('[pipeline-operator] audit_log:', auditErr.message);
    else if (row) audit_log_id = row.id as string;
  } catch (err) {
    console.error('[pipeline-operator] audit_log threw:', err instanceof Error ? err.message : err);
  }

  return {
    forDate, vaultPath: vaultResult.path, vaultStatus: vaultResult.status,
    total_actions: rows.length,
    by_status: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    promote_candidates: promote.slice(0, 10), demote_candidates: demote.slice(0, 10),
    ledger_id, audit_log_id,
  };
}
