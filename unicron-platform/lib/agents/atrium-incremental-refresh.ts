// lib/agents/atrium-incremental-refresh.ts
//
// Sprint 8 F7 (2026-05-13): retimed cron to America/Los_Angeles 0 6,9,12,15,18,21
// and added a vault pulse markdown file write (vault/Memory/analyst/<date>-pulse-<hh>.md).
// Surfaces intra-day pulse on Now: new ledger rows, new/completed action items,
// decisions in the last 3 hours.
//
// PR #379 origin (item 7): runs every 3 hours during the working day, computes
// what changed since the last refresh round, writes a ledger row of
// source_type='atrium_refresh' tagged with refresh_round_id, and emits a rollup
// for the Activity Feed.

import { createClient } from '@supabase/supabase-js';

interface IncrementalRefreshResult {
  status: 'ok' | 'skipped';
  round_id: string;
  new_ledger_rows: number;
  new_action_items: number;
  completed_action_items: number;
  new_decisions: number;
  vault_path: string | null;
}

interface PulseLedgerRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  created_at: string;
}

interface PulseActionItemRow {
  id: string;
  title: string;
  status: string | null;
  created_at: string;
  last_touched: string | null;
}

const VAULT_REPO = 'freakngenius/unicron-knowledge';

function makeServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env not configured');
  return createClient(url, key);
}

async function vaultRead(path: string): Promise<{ content: string; sha: string } | null> {
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) return null;
  const res = await fetch(
    `https://api.github.com/repos/${VAULT_REPO}/contents/${path}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const file = (await res.json()) as { content: string; sha: string };
  return { content: Buffer.from(file.content, 'base64').toString('utf-8'), sha: file.sha };
}

async function vaultWrite(path: string, content: string, message: string): Promise<boolean> {
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) {
    console.warn('[atrium-incremental-refresh] GITHUB_VAULT_TOKEN missing — skipping vault write');
    return false;
  }
  const existing = await vaultRead(path);
  const body: Record<string, unknown> = {
    message,
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
    console.error(`[atrium-incremental-refresh] vaultWrite failed ${path}: ${res.status} ${detail}`);
    return false;
  }
  return true;
}

export async function runIncrementalRefresh(): Promise<IncrementalRefreshResult> {
  const sb = makeServiceSupabase();
  const now = new Date();
  const roundId = `refresh-${now.toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
  const cutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

  // ── pulse data: last 3h ─────────────────────────────────────────────────
  const { data: newLedger } = await sb
    .schema('nervous_system')
    .from('ledger')
    .select('id, source_type, content_summary, created_at')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(50);

  const ledgerRows = (newLedger ?? []) as PulseLedgerRow[];
  const newDecisions = ledgerRows.filter(
    (r) => r.source_type === 'decision' || r.source_type === 'elder_decision'
  );

  const { data: newItems } = await sb
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, status, created_at, last_touched')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(20);
  const newActionItems = (newItems ?? []) as PulseActionItemRow[];

  const { data: closedItems } = await sb
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, status, created_at, last_touched')
    .in('status', ['done', 'closed', 'completed'])
    .gte('last_touched', cutoff)
    .order('last_touched', { ascending: false })
    .limit(20);
  const completedActionItems = (closedItems ?? []) as PulseActionItemRow[];

  // ── ledger rollup row ───────────────────────────────────────────────────
  const summary = `Atrium pulse · ${roundId} · ${ledgerRows.length} ledger, ${newActionItems.length} new AI, ${completedActionItems.length} closed AI, ${newDecisions.length} decisions in last 3h`;
  try {
    await sb.rpc('ns_ledger_insert_simple', {
      p_source_type: 'atrium_refresh',
      p_source_id: roundId,
      p_content_summary: summary,
      p_content_full: JSON.stringify({
        round_id: roundId,
        cutoff,
        ledger_count: ledgerRows.length,
        new_action_items: newActionItems.length,
        completed_action_items: completedActionItems.length,
        new_decisions: newDecisions.length,
      }),
      p_insights: { round_id: roundId },
    });
  } catch (err) {
    console.error('[atrium-incremental-refresh] ledger rollup failed:', err);
  }

  // ── vault pulse markdown ───────────────────────────────────────────────
  const ptDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const ptHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const ptHour = ptHourStr.replace(/[^\d]/g, '').padStart(2, '0');

  const ledgerSample =
    ledgerRows.slice(0, 8)
      .map((r) => `- \`${r.source_type}\` · ${(r.content_summary ?? '').slice(0, 100)}`)
      .join('\n') || '- _none_';
  const newAiBlock =
    newActionItems.length === 0
      ? '_no new action items_'
      : newActionItems.map((a) => `- ${a.title} _(${a.status ?? 'open'})_`).join('\n');
  const closedAiBlock =
    completedActionItems.length === 0
      ? '_none closed in this window_'
      : completedActionItems.map((a) => `- ✓ ${a.title}`).join('\n');
  const decisionsBlock =
    newDecisions.length === 0
      ? '_none_'
      : newDecisions.map((d) => `- ${(d.content_summary ?? '').slice(0, 140)}`).join('\n');

  const body = `---
date: ${ptDate}
hour_pt: ${ptHour}
kind: pulse
round_id: ${roundId}
generated_at: ${now.toISOString()}
---

# Pulse — ${ptDate} ${ptHour}:00 PT

## New ledger (${ledgerRows.length} in last 3h)
${ledgerSample}

## New action items (${newActionItems.length})
${newAiBlock}

## Completed action items (${completedActionItems.length})
${closedAiBlock}

## Decisions (${newDecisions.length})
${decisionsBlock}

_Generated by atrium-incremental-refresh @ ${now.toISOString()}_
`;
  const vaultPath = `vault/Memory/analyst/${ptDate}-pulse-${ptHour}.md`;
  const vaultOk = await vaultWrite(
    vaultPath,
    body,
    `analyst(pulse): ${ptDate} ${ptHour}:00 PT — ${ledgerRows.length}L / ${newActionItems.length}+AI / ${completedActionItems.length}✓AI / ${newDecisions.length}D`
  );

  // ── audit_log ───────────────────────────────────────────────────────────
  const result: IncrementalRefreshResult = {
    status: 'ok',
    round_id: roundId,
    new_ledger_rows: ledgerRows.length,
    new_action_items: newActionItems.length,
    completed_action_items: completedActionItems.length,
    new_decisions: newDecisions.length,
    vault_path: vaultOk ? vaultPath : null,
  };
  try {
    await sb.rpc('ns_audit_log_append', {
      p_table_name: 'atrium_incremental_refresh',
      p_action: 'pulse_complete',
      p_payload: result as unknown as object,
    });
  } catch (err) {
    console.error('[atrium-incremental-refresh] audit_log append failed:', err);
  }

  console.log(`[atrium-incremental-refresh] ${summary} · vault=${vaultPath}${vaultOk ? '' : ' (skipped)'}`);
  return result;
}
