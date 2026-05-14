// lib/agents/janitor.ts — Sprint 7.5 reification
//
// Janitor sweeps stale state and flags maintenance issues. NEVER auto-rotates
// secrets — every rotation requires explicit Kyle authorization through the
// refusal layer.
//
// Reads (declared data sources from nervous_system.agents.config):
//   - nervous_system.connected_services      → unhealthy / never-checked rows
//   - nervous_system.audit_log               → recent errors / refusals
//   - nervous_system.action_items            → stale open work
// Sink:
//   - vault file at wiki/memory/janitor/<for_date>.md (real GitHub commit)
//   - audit_log row action='janitor_sweep_complete' with counts
//   - Slack post to #orchestrator-feed if any critical findings (env-gated)
//
// Triggered via:
//   - Inngest function janitorSweepRun on event 'janitor/sweep.run'
//   - HTTP POST /api/atrium/agents/run/janitor

import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SLACK_FEED_CHANNEL_ID = process.env.SLACK_FEED_CHANNEL_ID;
const SLACK_TOKEN = process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;

interface ConnectedServiceRow {
  id: string;
  name: string;
  status: string | null;
  monthly_cost_usd: number | null;
  last_health_check_at: string | null;
}

interface AuditLogErrorRow {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface StaleActionItemRow {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  created_at: string;
}

export interface JanitorSweepResult {
  forDate: string;
  vaultPath: string;
  vaultStatus: number;
  findings: {
    unhealthy_services: number;
    recent_audit_errors: number;
    stale_action_items: number;
  };
  evidence: {
    services: Array<{ id: string; name: string; status: string | null; last_health_check_at: string | null }>;
    audit_errors: Array<{ id: string; action: string; created_at: string }>;
    stale_items: Array<{ id: string; title: string; created_at: string }>;
  };
  slack_posted: boolean;
  audit_log_id: string | null;
}

async function slackPost(channelId: string, text: string): Promise<boolean> {
  if (!SLACK_TOKEN) return false;
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelId, text }),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) {
      console.error(`[janitor] slack post failed: ${body.error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[janitor] slack post threw:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function janitorSweep(opts: { forDate?: string } = {}): Promise<JanitorSweepResult> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const forDate = opts.forDate ?? todayStr;

  // 1. Unhealthy / stale connected_services
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: servicesData, error: servicesErr } = await supabase
    .schema('nervous_system')
    .from('connected_services')
    .select('id, name, status, monthly_cost_usd, last_health_check_at')
    .or(`status.neq.healthy,last_health_check_at.lt.${sevenDaysAgo},last_health_check_at.is.null`)
    .order('name', { ascending: true });
  if (servicesErr) console.error('[janitor] services query:', servicesErr.message);
  const services = (servicesData ?? []) as ConnectedServiceRow[];

  // 2. Recent audit_log errors / refusals (last 7 days)
  const { data: auditData, error: auditErr } = await supabase
    .schema('nervous_system')
    .from('audit_log')
    .select('id, action, payload, created_at')
    .gte('created_at', sevenDaysAgo)
    .or('action.ilike.%error%,action.ilike.%fail%,action.ilike.%refus%,action.ilike.%bounce%')
    .order('created_at', { ascending: false })
    .limit(20);
  if (auditErr) console.error('[janitor] audit_log query:', auditErr.message);
  const auditErrors = (auditData ?? []) as AuditLogErrorRow[];

  // 3. Stale action_items (open / in_progress with due_at null or older than 14d)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
  const { data: staleData, error: staleErr } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, status, due_at, created_at')
    .in('status', ['open', 'in_progress'])
    .or(`due_at.is.null,due_at.lt.${fourteenDaysAgo}`)
    .order('created_at', { ascending: true })
    .limit(50);
  if (staleErr) console.error('[janitor] action_items query:', staleErr.message);
  const staleItems = (staleData ?? []) as StaleActionItemRow[];

  // Build report
  const lines: string[] = [];
  lines.push(`# Janitor Sweep — ${forDate}`);
  lines.push('');
  lines.push(`Run timestamp: ${now.toISOString()}`);
  lines.push('');
  lines.push(`## Findings summary`);
  lines.push('');
  lines.push(`- Unhealthy or never-checked connected_services: **${services.length}**`);
  lines.push(`- Recent audit_log errors/refusals (last 7d): **${auditErrors.length}**`);
  lines.push(`- Stale open action_items (null due_at or 14+ days overdue): **${staleItems.length}**`);
  lines.push('');

  if (services.length > 0) {
    lines.push(`## Unhealthy / stale services`);
    lines.push('');
    for (const s of services) {
      const lastCheck = s.last_health_check_at ? new Date(s.last_health_check_at).toISOString() : 'never';
      lines.push(`- **${s.name}** (\`${s.id}\`) status=${s.status ?? 'null'} last_health_check_at=${lastCheck}`);
    }
    lines.push('');
  }

  if (auditErrors.length > 0) {
    lines.push(`## Recent audit_log errors/refusals`);
    lines.push('');
    for (const e of auditErrors.slice(0, 10)) {
      const msg = (e.payload?.['error'] ?? e.payload?.['reason'] ?? '').toString().slice(0, 120);
      lines.push(`- \`${e.created_at}\` **${e.action}** ${msg ? `— ${msg}` : ''}`);
    }
    if (auditErrors.length > 10) {
      lines.push(`- _...and ${auditErrors.length - 10} more_`);
    }
    lines.push('');
  }

  if (staleItems.length > 0) {
    lines.push(`## Stale open action_items`);
    lines.push('');
    for (const ai of staleItems.slice(0, 15)) {
      const age = Math.floor((now.getTime() - new Date(ai.created_at).getTime()) / (24 * 3600 * 1000));
      lines.push(`- [${ai.status}] **${ai.title}** (\`${ai.id}\`) — ${age}d old, due_at=${ai.due_at ?? 'null'}`);
    }
    if (staleItems.length > 15) {
      lines.push(`- _...and ${staleItems.length - 15} more_`);
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`_Janitor flags state only. Secret rotation requires explicit Kyle authorization through the refusal layer (no auto-rotation)._`);

  const reportMd = lines.join('\n');

  // Write to vault
  const vaultResult = await writeAgentMemory('janitor', reportMd, forDate);

  // Slack alert if critical
  let slack_posted = false;
  const isCritical = services.length >= 3 || auditErrors.length >= 5;
  if (isCritical && SLACK_FEED_CHANNEL_ID) {
    const slackMsg = `:broom: *Janitor sweep ${forDate}* — ${services.length} unhealthy services, ${auditErrors.length} recent refusals/errors, ${staleItems.length} stale to-dos. Full report in vault: wiki/memory/janitor/${forDate}.md`;
    slack_posted = await slackPost(SLACK_FEED_CHANNEL_ID, slackMsg);
  }

  // audit_log row
  let audit_log_id: string | null = null;
  try {
    const { data: auditRow, error } = await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'nervous_system.agents',
        action: 'janitor_sweep_complete',
        payload: {
          for_date: forDate,
          vault_path: vaultResult.path,
          vault_status: vaultResult.status,
          findings: {
            unhealthy_services: services.length,
            recent_audit_errors: auditErrors.length,
            stale_action_items: staleItems.length,
          },
          slack_posted,
        },
      })
      .select('id')
      .single();
    if (error) {
      console.error('[janitor] audit_log insert:', error.message);
    } else if (auditRow) {
      audit_log_id = auditRow.id as string;
    }
  } catch (err) {
    console.error('[janitor] audit_log insert threw:', err instanceof Error ? err.message : err);
  }

  return {
    forDate,
    vaultPath: vaultResult.path,
    vaultStatus: vaultResult.status,
    findings: {
      unhealthy_services: services.length,
      recent_audit_errors: auditErrors.length,
      stale_action_items: staleItems.length,
    },
    evidence: {
      services: services.slice(0, 5).map((s) => ({ id: s.id, name: s.name, status: s.status, last_health_check_at: s.last_health_check_at })),
      audit_errors: auditErrors.slice(0, 5).map((e) => ({ id: e.id, action: e.action, created_at: e.created_at })),
      stale_items: staleItems.slice(0, 5).map((ai) => ({ id: ai.id, title: ai.title, created_at: ai.created_at })),
    },
    slack_posted,
    audit_log_id,
  };
}
