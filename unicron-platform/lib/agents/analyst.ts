// lib/agents/analyst.ts — Sprint 3 Stream A
// Analyst agent: scheduled intelligence jobs for the Unicron Nervous System.
//
// All functions are called by Inngest cron jobs (see inngest-fns.ts).
// Supabase schema: nervous_system (signals, ledger, action_items, agents, audit_log)
// Vault: freakngenius/unicron-knowledge (GitHub contents API)
// Slack: SLACK_ORCHESTRATOR_BOT_TOKEN; channels via env vars

import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';

// ---------------------------------------------------------------------------
// Shared clients
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VAULT_REPO = 'freakngenius/unicron-knowledge';

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

async function slackPost(channelId: string, text: string): Promise<void> {
  const token = process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;
  if (!token) {
    console.warn('[analyst] SLACK_ORCHESTRATOR_BOT_TOKEN not set — skipping Slack post');
    return;
  }
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelId, text }),
  });
  const body = (await res.json()) as { ok: boolean; error?: string };
  if (!body.ok) {
    console.error(`[analyst] slackPost failed: ${body.error} channel=${channelId}`);
  } else {
    console.log(`[analyst] slackPost ok channel=${channelId}`);
  }
}

/**
 * Read a file from the vault. Returns { content, sha } or null if 404.
 */
async function vaultRead(path: string): Promise<{ content: string; sha: string } | null> {
  const token = process.env.GITHUB_VAULT_TOKEN!;
  const res = await fetch(
    `https://api.github.com/repos/${VAULT_REPO}/contents/${path}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    console.warn(`[analyst] vaultRead ${path}: status ${res.status}`);
    return null;
  }
  const file = (await res.json()) as { content: string; sha: string };
  const content = Buffer.from(file.content, 'base64').toString('utf-8');
  return { content, sha: file.sha };
}

/**
 * Write a file to the vault (creates or updates).
 */
async function vaultWrite(path: string, content: string, commitMessage: string): Promise<void> {
  const token = process.env.GITHUB_VAULT_TOKEN!;

  // Fetch existing SHA if the file exists
  const existing = await vaultRead(path);

  const body: Record<string, unknown> = {
    message: commitMessage,
    content: Buffer.from(content).toString('base64'),
    committer: { name: 'Unicron Analyst', email: 'agent@unicron.systems' },
  };
  if (existing) body.sha = existing.sha;

  const res = await fetch(
    `https://api.github.com/repos/${VAULT_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    console.error(`[analyst] vaultWrite failed for ${path}: ${res.status} — ${detail}`);
  }
}

/**
 * Return ISO week string e.g. "2026-W18"
 */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 1. decayTick — signal and ledger strength decay
// ---------------------------------------------------------------------------

interface SignalRow {
  id: string;
  strength: number;
  ttl_days: number;
}

interface LedgerRow {
  id: string;
  strength: number;
  ttl_days: number;
}

export async function decayTick(): Promise<{ archived_signals: number; archived_ledger: number }> {
  console.log('[analyst] decayTick: starting');

  // --- Signals ---
  const { data: signals, error: signalsErr } = await supabase
    .schema('nervous_system')
    .from('signals')
    .select('id, strength, ttl_days')
    .eq('status', 'active');

  if (signalsErr) {
    console.error('[analyst] decayTick signals query error:', signalsErr.message);
  }

  let archivedSignals = 0;
  if (signals && signals.length > 0) {
    const signalRows = signals as SignalRow[];
    await Promise.all(
      signalRows.map(async (row) => {
        const ttl = row.ttl_days > 0 ? row.ttl_days : 30;
        const newStrength = row.strength * (1 - 1 / ttl);

        if (newStrength < 0.1) {
          await supabase
            .schema('nervous_system')
            .from('signals')
            .update({ strength: newStrength, status: 'archived' })
            .eq('id', row.id);
          archivedSignals++;
        } else {
          await supabase
            .schema('nervous_system')
            .from('signals')
            .update({ strength: newStrength })
            .eq('id', row.id);
        }
      })
    );
  }

  // --- Ledger ---
  const { data: ledger, error: ledgerErr } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .select('id, strength, ttl_days')
    .eq('status', 'active');

  if (ledgerErr) {
    console.error('[analyst] decayTick ledger query error:', ledgerErr.message);
  }

  let archivedLedger = 0;
  if (ledger && ledger.length > 0) {
    const ledgerRows = ledger as LedgerRow[];
    await Promise.all(
      ledgerRows.map(async (row) => {
        const ttl = row.ttl_days > 0 ? row.ttl_days : 90;
        const newStrength = row.strength * (1 - 1 / ttl);

        if (newStrength < 0.1) {
          await supabase
            .schema('nervous_system')
            .from('ledger')
            .update({ strength: newStrength, status: 'archived' })
            .eq('id', row.id);
          archivedLedger++;
        } else {
          await supabase
            .schema('nervous_system')
            .from('ledger')
            .update({ strength: newStrength })
            .eq('id', row.id);
        }
      })
    );
  }

  console.log(
    `[analyst] decayTick done: archived_signals=${archivedSignals} archived_ledger=${archivedLedger}`
  );
  return { archived_signals: archivedSignals, archived_ledger: archivedLedger };
}

// ---------------------------------------------------------------------------
// 2. dailyDigest — yesterday's events → vault + Slack
// ---------------------------------------------------------------------------

interface LedgerEventRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  created_at: string;
}

interface ActionItemRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string;
}

export async function dailyDigest(opts: { forDate?: string } = {}): Promise<{ forDate: string; vaultPath: string; vaultStatus: number; events: number; actionItems: number }> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = opts.forDate ?? yesterday.toISOString().split('T')[0];
  const nextDay = new Date(`${yesterdayStr}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0];
  void todayStr;

  console.log(`[analyst] dailyDigest: aggregating ${yesterdayStr}`);

  // Fetch yesterday's ledger events
  const { data: events, error: eventsErr } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .select('id, source_type, content_summary, created_at')
    .gte('created_at', `${yesterdayStr}T00:00:00Z`)
    .lt('created_at', `${nextDayStr}T00:00:00Z`)
    .order('created_at', { ascending: true });

  if (eventsErr) console.error('[analyst] dailyDigest ledger error:', eventsErr.message);

  // Fetch action items created or updated yesterday
  const { data: actionItems, error: aiErr } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, status, priority, due_at, created_at')
    .gte('created_at', `${yesterdayStr}T00:00:00Z`)
    .lt('created_at', `${nextDayStr}T00:00:00Z`)
    .order('priority', { ascending: true });

  if (aiErr) console.error('[analyst] dailyDigest action_items error:', aiErr.message);

  const eventRows = (events ?? []) as LedgerEventRow[];
  const aiRows = (actionItems ?? []) as ActionItemRow[];

  // Build the digest narrative
  const eventsByType: Record<string, number> = {};
  for (const e of eventRows) {
    eventsByType[e.source_type] = (eventsByType[e.source_type] ?? 0) + 1;
  }
  const eventSummary = Object.entries(eventsByType)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ') || 'no events';

  const aiSummary =
    aiRows.length > 0
      ? aiRows.map((a) => `- [${a.priority}] ${a.title} (${a.status})`).join('\n')
      : '- none';

  const sampleEvents =
    eventRows
      .slice(0, 5)
      .map(
        (e) =>
          `- ${e.source_type}: ${(e.content_summary ?? '').slice(0, 80)}`
      )
      .join('\n') || '- none';

  const narrativeMd = `## Daily Digest — ${yesterdayStr}

### Events (${eventRows.length} total: ${eventSummary})
${sampleEvents}${eventRows.length > 5 ? `\n- ...and ${eventRows.length - 5} more` : ''}

### New Action Items (${aiRows.length})
${aiSummary}

_Generated at ${now.toISOString()}_`;

  // Write to vault at wiki/memory/analyst/<yesterdayStr>.md so the UI date
  // selector for "yesterday" finds the file at the matching path.
  const vaultResult = await writeAgentMemory('analyst', narrativeMd, yesterdayStr);

  // Post short version to Slack feed channel
  const feedChannelId = process.env.SLACK_FEED_CHANNEL_ID;
  if (feedChannelId) {
    const shortMsg = `*Daily Digest ${yesterdayStr}*: ${eventRows.length} events (${eventSummary}). ${aiRows.length} new action items. Full log in vault.`;
    const truncated = shortMsg.slice(0, 280);
    await slackPost(feedChannelId, truncated);
  } else {
    console.warn('[analyst] dailyDigest: SLACK_FEED_CHANNEL_ID not set, skipping Slack post');
  }

  console.log('[analyst] dailyDigest done');
  return {
    forDate: yesterdayStr,
    vaultPath: vaultResult.path,
    vaultStatus: vaultResult.status,
    events: eventRows.length,
    actionItems: aiRows.length,
  };
}

// ---------------------------------------------------------------------------
// 3. driftFlagScan — past-due / orphaned items + over-budget agents
// ---------------------------------------------------------------------------

interface OverdueActionItem {
  id: string;
  title: string;
  due_at: string;
  dri: string | null;
}

interface OrphanedActionItem {
  id: string;
  title: string;
  created_at: string;
}

interface AgentBudgetRow {
  name: string;
  current_spent_usd: number;
  limit_usd_per_period: number;
}

export async function driftFlagScan(): Promise<void> {
  console.log('[analyst] driftFlagScan: starting');

  const escalationsChannelId = process.env.SLACK_ESCALATIONS_CHANNEL_ID;
  const findings: string[] = [];

  // Past-due open action items
  const { data: overdue, error: overdueErr } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, due_at, dri')
    .lt('due_at', new Date().toISOString())
    .eq('status', 'open');

  if (overdueErr) {
    console.error('[analyst] driftFlagScan overdue error:', overdueErr.message);
  } else if (overdue && overdue.length > 0) {
    const overdueRows = overdue as OverdueActionItem[];
    const items = overdueRows
      .slice(0, 10)
      .map((a) => `• [OVERDUE] ${a.title} (due ${a.due_at?.split('T')[0] ?? 'unknown'}, DRI: ${a.dri ?? 'none'})`)
      .join('\n');
    findings.push(`*${overdueRows.length} past-due action item(s):*\n${items}`);
  }

  // Orphaned action items (no DRI)
  const { data: orphaned, error: orphanedErr } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, created_at')
    .is('dri', null)
    .eq('status', 'open');

  if (orphanedErr) {
    console.error('[analyst] driftFlagScan orphaned error:', orphanedErr.message);
  } else if (orphaned && orphaned.length > 0) {
    const orphanedRows = orphaned as OrphanedActionItem[];
    const items = orphanedRows
      .slice(0, 10)
      .map((a) => `• [NO DRI] ${a.title}`)
      .join('\n');
    findings.push(`*${orphanedRows.length} action item(s) with no DRI:*\n${items}`);
  }

  // Over-budget agents
  const { data: agents, error: agentsErr } = await supabase
    .from('agents')
    .select('name, current_spent_usd, limit_usd_per_period')
    .not('limit_usd_per_period', 'is', null);

  if (agentsErr) {
    console.error('[analyst] driftFlagScan agents error:', agentsErr.message);
  } else if (agents && agents.length > 0) {
    const agentRows = agents as AgentBudgetRow[];
    const overBudget = agentRows.filter(
      (a) => a.current_spent_usd >= a.limit_usd_per_period
    );
    if (overBudget.length > 0) {
      const items = overBudget
        .map(
          (a) =>
            `• [OVER BUDGET] ${a.name}: $${a.current_spent_usd.toFixed(2)}/$${a.limit_usd_per_period.toFixed(2)}`
        )
        .join('\n');
      findings.push(`*${overBudget.length} over-budget agent(s):*\n${items}`);
    }
  }

  if (findings.length === 0) {
    console.log('[analyst] driftFlagScan: no drift detected');
    return;
  }

  const message = `*Drift Flag Scan — ${new Date().toISOString().split('T')[0]}*\n\n${findings.join('\n\n')}`;

  if (escalationsChannelId) {
    await slackPost(escalationsChannelId, message);
  } else {
    console.warn('[analyst] driftFlagScan: SLACK_ESCALATIONS_CHANNEL_ID not set');
    console.log('[analyst] driftFlagScan findings:', message);
  }

  console.log('[analyst] driftFlagScan done');
}

// ---------------------------------------------------------------------------
// 4. weeklyRetro — week's events → vault retro doc + Slack
// ---------------------------------------------------------------------------

export async function weeklyRetro(weekRange: { start: string; end: string }): Promise<void> {
  const { start, end } = weekRange;
  console.log(`[analyst] weeklyRetro: ${start} → ${end}`);

  const weekLabel = isoWeek(new Date(start));

  // Fetch ledger events for the week
  const { data: events, error: eventsErr } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .select('id, source_type, content_summary, created_at')
    .gte('created_at', `${start}T00:00:00Z`)
    .lt('created_at', `${end}T23:59:59Z`)
    .order('created_at', { ascending: true });

  if (eventsErr) console.error('[analyst] weeklyRetro ledger error:', eventsErr.message);

  // Fetch action items completed this week
  const { data: completedItems, error: ciErr } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, status, priority, due_at')
    .eq('status', 'done')
    .gte('updated_at', `${start}T00:00:00Z`)
    .lt('updated_at', `${end}T23:59:59Z`);

  if (ciErr) console.error('[analyst] weeklyRetro action_items done error:', ciErr.message);

  // Fetch still-open action items
  const { data: openItems, error: oiErr } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, priority, due_at')
    .in('status', ['open', 'in_progress']);

  if (oiErr) console.error('[analyst] weeklyRetro open items error:', oiErr.message);

  const eventRows = (events ?? []) as LedgerEventRow[];
  const doneRows = (completedItems ?? []) as ActionItemRow[];
  const openRows = (openItems ?? []) as ActionItemRow[];

  const eventsByType: Record<string, number> = {};
  for (const e of eventRows) {
    eventsByType[e.source_type] = (eventsByType[e.source_type] ?? 0) + 1;
  }
  const eventSummary = Object.entries(eventsByType)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ') || 'no events';

  const doneSummary =
    doneRows.length > 0
      ? doneRows.map((a) => `- [x] ${a.title}`).join('\n')
      : '- none';

  const openSummary =
    openRows.length > 0
      ? openRows
          .slice(0, 15)
          .map((a) => `- [ ] [${a.priority}] ${a.title}`)
          .join('\n')
      : '- none';

  const retroMd = `---
type: retro
week: ${weekLabel}
range: ${start} → ${end}
---

# Weekly Retro — ${weekLabel}

## Activity (${eventRows.length} events: ${eventSummary})

## Completed this week (${doneRows.length})
${doneSummary}

## Still open (${openRows.length})
${openSummary}

_Generated at ${new Date().toISOString()}_`;

  // Write to vault at wiki/retros/YYYY-WW.md
  await vaultWrite(
    `wiki/retros/${weekLabel}.md`,
    retroMd,
    `retro(analyst): weekly retro ${weekLabel}`
  );

  // Post summary to Slack feed channel
  const feedChannelId = process.env.SLACK_FEED_CHANNEL_ID;
  if (feedChannelId) {
    const shortMsg = `*Weekly Retro ${weekLabel}*: ${eventRows.length} events. ${doneRows.length} completed. ${openRows.length} open. Full retro in vault.`;
    await slackPost(feedChannelId, shortMsg.slice(0, 280));
  } else {
    console.warn('[analyst] weeklyRetro: SLACK_FEED_CHANNEL_ID not set');
  }

  console.log(`[analyst] weeklyRetro done: ${weekLabel}`);
}

// ---------------------------------------------------------------------------
// 5. memoryConsolidation — merge old weak memory entries
// ---------------------------------------------------------------------------

export async function memoryConsolidation(): Promise<void> {
  console.log('[analyst] memoryConsolidation: starting');

  const indexPath = 'wiki/memory/analyst/index.md';
  const indexFile = await vaultRead(indexPath);

  if (!indexFile) {
    console.log('[analyst] memoryConsolidation: no index found, skipping');
    return;
  }

  const lines = indexFile.content.split('\n');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);

  // Identify lines that reference dated memory files (YYYY-MM-DD.md pattern)
  const datePattern = /(\d{4}-\d{2}-\d{2})\.md/;
  const oldEntries: string[] = [];
  const retainedLines: string[] = [];

  for (const line of lines) {
    const match = line.match(datePattern);
    if (match) {
      const entryDate = new Date(match[1]);
      if (entryDate < cutoffDate) {
        oldEntries.push(match[1]);
      } else {
        retainedLines.push(line);
      }
    } else {
      retainedLines.push(line);
    }
  }

  if (oldEntries.length === 0) {
    console.log('[analyst] memoryConsolidation: no old entries found');
    return;
  }

  // Fetch and summarise old entries (up to 10)
  const toConsolidate = oldEntries.slice(0, 10);
  const entryContents: string[] = [];

  for (const dateStr of toConsolidate) {
    const file = await vaultRead(`wiki/memory/analyst/${dateStr}.md`);
    if (file) {
      entryContents.push(`### ${dateStr}\n${file.content.slice(0, 500)}`);
    }
  }

  if (entryContents.length === 0) {
    console.log('[analyst] memoryConsolidation: entries not found in vault');
    return;
  }

  const consolidationEntry = `## Memory Consolidation — ${new Date().toISOString().split('T')[0]}

Consolidated ${toConsolidate.length} entries older than 30 days (${toConsolidate[0]} to ${toConsolidate[toConsolidate.length - 1]}).

### Summary of consolidated entries

${entryContents.join('\n\n')}

_Consolidated at ${new Date().toISOString()}_`;

  // Write consolidation entry to today's memory log
  await writeAgentMemory('analyst', consolidationEntry);

  // Update index to remove consolidated entries
  const updatedIndex = retainedLines.join('\n');
  await vaultWrite(indexPath, updatedIndex, 'memory(analyst): consolidate old entries');

  console.log(`[analyst] memoryConsolidation done: consolidated ${toConsolidate.length} entries`);
}

// ---------------------------------------------------------------------------
// 6. continuityAudit — find expiring commitments in Elder's log
// ---------------------------------------------------------------------------

interface ContinuityEntry {
  title: string;
  active_until: string;
}

export async function continuityAudit(): Promise<void> {
  console.log('[analyst] continuityAudit: starting');

  const escalationsChannelId = process.env.SLACK_ESCALATIONS_CHANNEL_ID;
  const continuityPath = 'wiki/memory/elder/continuity.md';

  const file = await vaultRead(continuityPath);
  if (!file) {
    console.log('[analyst] continuityAudit: no continuity log found');
    return;
  }

  // Parse the continuity log — look for YAML-style entries with active_until fields
  // Format expected: lines like "active_until: YYYY-MM-DD" near "title: ..." lines
  const content = file.content;
  const entries: ContinuityEntry[] = [];

  const blocks = content.split(/\n---\n/).filter(Boolean);
  for (const block of blocks) {
    const titleMatch = block.match(/^title:\s*(.+)$/m);
    const untilMatch = block.match(/^active_until:\s*(\d{4}-\d{2}-\d{2})/m);
    if (titleMatch && untilMatch) {
      entries.push({
        title: titleMatch[1].trim(),
        active_until: untilMatch[1].trim(),
      });
    }
  }

  // Filter entries expiring within next 30 days
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(now.getDate() + 30);

  const expiring = entries.filter((e) => {
    const d = new Date(e.active_until);
    return d >= now && d <= horizon;
  });

  if (expiring.length === 0) {
    console.log('[analyst] continuityAudit: no expiring commitments in 30-day window');
    return;
  }

  const list = expiring
    .map((e) => `• ${e.title} — expires ${e.active_until}`)
    .join('\n');

  const message = `*Continuity Audit — ${now.toISOString().split('T')[0]}*\n\n${expiring.length} commitment(s) expiring within 30 days:\n${list}`;

  if (escalationsChannelId) {
    await slackPost(escalationsChannelId, message);
  } else {
    console.warn('[analyst] continuityAudit: SLACK_ESCALATIONS_CHANNEL_ID not set');
    console.log('[analyst] continuityAudit findings:', message);
  }

  console.log(`[analyst] continuityAudit done: ${expiring.length} expiring`);
}

// ---------------------------------------------------------------------------
// 7. tabooReview — audit taboo bounces from last 90 days
// ---------------------------------------------------------------------------

interface AuditLogRow {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export async function tabooReview(): Promise<void> {
  console.log('[analyst] tabooReview: starting');

  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data: auditRows, error } = await supabase
    .from('audit_log')
    .select('id, action, payload, created_at')
    .eq('action', 'taboo_bounce')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[analyst] tabooReview audit_log error:', error.message);
    return;
  }

  const rows = (auditRows ?? []) as AuditLogRow[];

  if (rows.length === 0) {
    console.log('[analyst] tabooReview: no taboo bounces in last 90 days');
    return;
  }

  // Count occurrences by reason/intent
  const reasonCounts: Record<string, number> = {};
  for (const row of rows) {
    const reason =
      (row.payload?.reason as string) ||
      (row.payload?.intent as string) ||
      'unknown';
    const key = reason.slice(0, 80);
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
  }

  const sorted = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
  const topTaboos = sorted
    .slice(0, 5)
    .map(([reason, count]) => `• ${count}x — ${reason}`)
    .join('\n');

  const feedChannelId = process.env.SLACK_FEED_CHANNEL_ID;
  const summary = `*Taboo Review (last 90 days)*: ${rows.length} total bounces across ${sorted.length} distinct reasons.\n\nTop patterns:\n${topTaboos}`;

  if (feedChannelId) {
    await slackPost(feedChannelId, summary);
  } else {
    console.warn('[analyst] tabooReview: SLACK_FEED_CHANNEL_ID not set');
  }

  const now = new Date();
  const weekLabel = isoWeek(now);
  const reportMd = `---
type: taboo-review
generated: ${now.toISOString()}
period: last 90 days
total_bounces: ${rows.length}
distinct_reasons: ${sorted.length}
---

# Taboo Review — ${weekLabel}

## Summary

${rows.length} taboo bounces recorded in the last 90 days across ${sorted.length} distinct patterns.

## Top Taboos Hit

${sorted.map(([r, c]) => `- **${c}x** — ${r}`).join('\n')}

_Generated at ${now.toISOString()}_`;

  await writeAgentMemory('analyst', reportMd);

  console.log(`[analyst] tabooReview done: ${rows.length} bounces`);
}

// ---------------------------------------------------------------------------
// 8. regenerateMasterIndex — rebuild wiki/_master-index.md
// ---------------------------------------------------------------------------

interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
  url: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface GitHubRefResponse {
  object: { sha: string };
}

export async function regenerateMasterIndex(): Promise<void> {
  console.log('[analyst] regenerateMasterIndex: starting');

  const token = process.env.GITHUB_VAULT_TOKEN!;

  // Fetch the full git tree (recursive) for the knowledge repo
  const refRes = await fetch(
    `https://api.github.com/repos/${VAULT_REPO}/git/ref/heads/main`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!refRes.ok) {
    console.error(`[analyst] regenerateMasterIndex: could not fetch ref: ${refRes.status}`);
    return;
  }

  const refData = (await refRes.json()) as GitHubRefResponse;
  const treeSha = refData.object.sha;

  const treeRes = await fetch(
    `https://api.github.com/repos/${VAULT_REPO}/git/trees/${treeSha}?recursive=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!treeRes.ok) {
    console.error(`[analyst] regenerateMasterIndex: tree fetch failed: ${treeRes.status}`);
    return;
  }

  const treeData = (await treeRes.json()) as GitHubTreeResponse;
  const files = treeData.tree.filter(
    (item) => item.type === 'blob' && item.path.endsWith('.md') && !item.path.startsWith('_')
  );

  // Group files by top-level directory
  const grouped: Record<string, string[]> = {};
  for (const file of files) {
    const parts = file.path.split('/');
    const section = parts.length > 1 ? parts[0] : 'root';
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(file.path);
  }

  const now = new Date();
  const sections = Object.keys(grouped).sort();

  let toc = `---
type: master-index
generated: ${now.toISOString()}
total_files: ${files.length}
truncated: ${treeData.truncated}
---

# Wiki Master Index

_Auto-generated by Analyst agent. Last updated: ${now.toISOString()}_

`;

  for (const section of sections) {
    const sectionFiles = grouped[section].sort();
    toc += `## ${section}\n\n`;
    for (const filePath of sectionFiles) {
      const fileName = filePath.split('/').pop() ?? filePath;
      const displayName = fileName.replace('.md', '').replace(/-/g, ' ');
      toc += `- [${displayName}](${filePath})\n`;
    }
    toc += '\n';
  }

  await vaultWrite('wiki/_master-index.md', toc, 'index(analyst): regenerate master index');

  console.log(`[analyst] regenerateMasterIndex done: ${files.length} files indexed`);
}

// ---------------------------------------------------------------------------
// 9. wikiLint — check for broken links in _master-index.md
// ---------------------------------------------------------------------------

export async function wikiLint(): Promise<void> {
  console.log('[analyst] wikiLint: starting');

  const token = process.env.GITHUB_VAULT_TOKEN!;
  const indexFile = await vaultRead('wiki/_master-index.md');

  if (!indexFile) {
    console.log('[analyst] wikiLint: _master-index.md not found, skipping');
    return;
  }

  // Extract all markdown links: [text](path)
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ text: string; path: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(indexFile.content)) !== null) {
    links.push({ text: match[1], path: match[2] });
  }

  if (links.length === 0) {
    console.log('[analyst] wikiLint: no links found in master index');
    return;
  }

  console.log(`[analyst] wikiLint: checking ${links.length} links`);

  // Check each link — 5 at a time to avoid rate limits
  const brokenLinks: Array<{ text: string; path: string; status: number }> = [];

  const checkBatch = async (batch: typeof links) => {
    await Promise.all(
      batch.map(async (link) => {
        const res = await fetch(
          `https://api.github.com/repos/${VAULT_REPO}/contents/${link.path}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.status === 404) {
          brokenLinks.push({ ...link, status: 404 });
        }
      })
    );
  };

  // Process in batches of 5
  for (let i = 0; i < links.length; i += 5) {
    await checkBatch(links.slice(i, i + 5));
  }

  const now = new Date();
  const weekLabel = isoWeek(now);

  const reportMd = `---
type: wiki-lint
generated: ${now.toISOString()}
total_links: ${links.length}
broken_links: ${brokenLinks.length}
---

# Wiki Lint Report — ${weekLabel}

_Checked ${links.length} links in \`wiki/_master-index.md\`._

## ${brokenLinks.length === 0 ? 'All links OK' : `Broken Links (${brokenLinks.length})`}

${
  brokenLinks.length === 0
    ? '_No broken links found._'
    : brokenLinks.map((l) => `- [${l.text}](${l.path}) — HTTP ${l.status}`).join('\n')
}

_Generated at ${now.toISOString()}_`;

  await vaultWrite(
    `outputs/reports/wiki-lint-${weekLabel}.md`,
    reportMd,
    `lint(analyst): wiki lint report ${weekLabel}`
  );

  if (brokenLinks.length > 0) {
    console.warn(`[analyst] wikiLint: ${brokenLinks.length} broken link(s) found`);
  }

  console.log(`[analyst] wikiLint done: ${brokenLinks.length}/${links.length} broken`);
}

// ---------------------------------------------------------------------------
// 10. analystWikiSync — nightly regeneration of whats-connected.md
// ---------------------------------------------------------------------------
//
// Queries nervous_system.connected_services and nervous_system.agents,
// renders markdown tables, and pushes to vault.
// CRITICAL: preserves <!-- protected -->...<!-- /protected --> blocks verbatim.

interface ConnectedServiceRow {
  name: string;
  category: string | null;
  status: string | null;
  owner_team_member_id: string | null;
  monthly_cost_usd: number | null;
}

interface AgentRow {
  name: string;
  status: string | null;
  last_run: string | null;
}

function extractProtectedBlocks(content: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const re = /<!-- protected -->([\s\S]*?)<!-- \/protected -->/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(content)) !== null) {
    blocks.set(`__PROTECTED_${idx}__`, match[0]);
    idx++;
  }
  return blocks;
}

export async function analystWikiSync(): Promise<void> {
  console.log('[analyst] analystWikiSync: starting');

  // ── Fetch connected_services ──────────────────────────────────────────────
  const { data: services, error: servicesErr } = await supabase
    .schema('nervous_system')
    .from('connected_services')
    .select('name, category, status, owner_team_member_id, monthly_cost_usd')
    .order('name', { ascending: true });

  if (servicesErr) {
    console.error('[analyst] analystWikiSync connected_services error:', servicesErr.message);
  }

  // ── Fetch agents ──────────────────────────────────────────────────────────
  const { data: agents, error: agentsErr } = await supabase
    .schema('nervous_system')
    .from('agents')
    .select('name, status, last_run')
    .order('name', { ascending: true });

  if (agentsErr) {
    console.error('[analyst] analystWikiSync agents error:', agentsErr.message);
  }

  const serviceRows = (services ?? []) as ConnectedServiceRow[];
  const agentRows = (agents ?? []) as AgentRow[];

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // ── Build services table ──────────────────────────────────────────────────
  const servicesTable =
    serviceRows.length > 0
      ? [
          '| Name | Category | Status | Owner | Cost/mo |',
          '|---|---|---|---|---|',
          ...serviceRows.map(
            (s) =>
              `| ${s.name} | ${s.category ?? ''} | ${s.status ?? ''} | ${s.owner_team_member_id ?? ''} | ${s.monthly_cost_usd != null ? `$${s.monthly_cost_usd.toFixed(2)}` : ''} |`
          ),
        ].join('\n')
      : '_No connected services recorded._';

  // ── Build agents table ────────────────────────────────────────────────────
  const agentsTable =
    agentRows.length > 0
      ? [
          '| Name | Status | Last Run |',
          '|---|---|---|',
          ...agentRows.map(
            (a) =>
              `| ${a.name} | ${a.status ?? ''} | ${a.last_run ? a.last_run.slice(0, 19).replace('T', ' ') : ''} |`
          ),
        ].join('\n')
      : '_No agents recorded._';

  // ── Load existing file to preserve protected blocks ───────────────────────
  const existingFile = await vaultRead('wiki/whats-connected.md');
  const protectedBlocks = existingFile
    ? extractProtectedBlocks(existingFile.content)
    : new Map<string, string>();

  // Build a placeholder-mapped version of the content
  // (we embed placeholders in our new content where protected blocks should go)
  const newContent = `---
type: integration_map
status: active
ttl_days: 90
last_touched: ${dateStr}
generated_by: analyst (analystWikiSync)
---

# What's Connected

Live integration map for the Unicron Nervous System. Auto-regenerated nightly by the Analyst agent.

---

## As of ${dateStr}

### Connected Services

${servicesTable}

### Agents

${agentsTable}

---

_Last regenerated: ${now.toISOString()}_
`;

  // Re-embed any protected blocks from the old file
  let finalContent = newContent;
  if (protectedBlocks.size > 0 && existingFile) {
    // Append protected blocks at the end (preserving them verbatim)
    const blocksSection = Array.from(protectedBlocks.values()).join('\n\n');
    finalContent = newContent.trimEnd() + '\n\n' + blocksSection + '\n';
  }

  await vaultWrite(
    'wiki/whats-connected.md',
    finalContent,
    `wiki(analyst): nightly whats-connected regeneration ${dateStr}`
  );

  console.log(
    `[analyst] analystWikiSync done: ${serviceRows.length} services, ${agentRows.length} agents`
  );
}

// ---------------------------------------------------------------------------
// Sprint 8 F3 — Morning Brief
// Writes vault/Memory/analyst/<YYYY-MM-DD>-morning.md every weekday at 05:00 PT.
// Body: overnight ledger (last 24h ending now), today's calendar, open action items.
// Audit-logged via ns_audit_log_append (action='morning_brief_complete').
// ---------------------------------------------------------------------------

interface MorningLedgerRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  created_at: string;
}

interface MorningCalendarRow {
  title: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  attendees: unknown;
}

interface MorningActionItemRow {
  id: string;
  title: string;
  priority: string | null;
  due_at: string | null;
  status: string | null;
}

export async function writeMorningBrief(): Promise<{
  vault_path: string;
  ledger_count: number;
  calendar_count: number;
  open_action_items: number;
}> {
  const now = new Date();
  // Pacific date for filename — write the brief tagged to "today" in PT.
  const ptDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const todayEndPt = new Date(now);
  todayEndPt.setHours(23, 59, 59, 999);

  console.log(`[analyst] writeMorningBrief: ${ptDate} (overnight since ${since})`);

  const { data: ledger } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .select('id, source_type, content_summary, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: calendar } = await supabase
    .schema('nervous_system')
    .from('calendar_events')
    .select('title, start_at, end_at, location, attendees')
    .gte('start_at', now.toISOString())
    .lte('start_at', todayEndPt.toISOString())
    .order('start_at', { ascending: true })
    .limit(20);

  const { data: openItems } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, priority, due_at, status')
    .not('status', 'in', '("done","closed","completed")')
    .order('priority', { ascending: true })
    .limit(20);

  const ledgerRows = (ledger ?? []) as MorningLedgerRow[];
  const calendarRows = (calendar ?? []) as MorningCalendarRow[];
  const actionItemRows = (openItems ?? []) as MorningActionItemRow[];

  const ledgerByType: Record<string, number> = {};
  for (const r of ledgerRows) {
    ledgerByType[r.source_type] = (ledgerByType[r.source_type] ?? 0) + 1;
  }
  const ledgerSummary = Object.entries(ledgerByType)
    .map(([t, n]) => `${n} ${t}`)
    .join(', ') || 'no overnight events';

  const ledgerSample =
    ledgerRows.slice(0, 8)
      .map((r) => `- \`${r.source_type}\` · ${(r.content_summary ?? '').slice(0, 100)}`)
      .join('\n') || '- _none_';

  const calendarBlock =
    calendarRows.length === 0
      ? '_no events on calendar today_'
      : calendarRows
          .map((c) => {
            const start = new Date(c.start_at).toLocaleTimeString('en-US', {
              timeZone: 'America/Los_Angeles',
              hour: 'numeric',
              minute: '2-digit',
            });
            const title = c.title ?? '(untitled)';
            const loc = c.location ? ` · ${c.location}` : '';
            return `- **${start} PT** · ${title}${loc}`;
          })
          .join('\n');

  const actionBlock =
    actionItemRows.length === 0
      ? '_no open action items_'
      : actionItemRows
          .map((a) => {
            const due = a.due_at
              ? ` · due ${new Date(a.due_at).toISOString().slice(0, 10)}`
              : '';
            const pri = a.priority ? `[${a.priority}] ` : '';
            return `- ${pri}${a.title}${due}`;
          })
          .join('\n');

  const body = `---
date: ${ptDate}
kind: morning-brief
generated_at: ${now.toISOString()}
generated_tz: America/Los_Angeles
---

# Morning Brief — ${ptDate}

## Overnight (${ledgerRows.length} events: ${ledgerSummary})
${ledgerSample}

## Today's Calendar (${calendarRows.length})
${calendarBlock}

## Open Action Items (${actionItemRows.length})
${actionBlock}

_Generated by Analyst @ ${now.toISOString()}_
`;

  const vaultPath = `vault/Memory/analyst/${ptDate}-morning.md`;
  await vaultWrite(
    vaultPath,
    body,
    `analyst(morning-brief): ${ptDate} — ${ledgerRows.length} overnight events, ${calendarRows.length} calendar, ${actionItemRows.length} open`
  );

  const result = {
    vault_path: vaultPath,
    ledger_count: ledgerRows.length,
    calendar_count: calendarRows.length,
    open_action_items: actionItemRows.length,
  };

  const { error: auditErr } = await supabase.rpc('ns_audit_log_append', {
    p_table_name: 'analyst_morning_brief',
    p_action: 'morning_brief_complete',
    p_payload: result as unknown as object,
  });
  if (auditErr) {
    console.error(`[analyst] morning_brief audit_log failed: ${auditErr.message}`);
  }

  console.log(`[analyst] writeMorningBrief done → ${vaultPath}`);
  return result;
}
