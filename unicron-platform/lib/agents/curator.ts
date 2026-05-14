// lib/agents/curator.ts — Sprint 7.5 reification
//
// Curator handles vault content organization, dedup, and surfaces stale
// wiki pages. Read-mostly; writes archive markers via ns_archive_topic (when
// applicable) and a weekly hygiene report to vault.
//
// Reads (declared data sources from nervous_system.agents.config):
//   - nervous_system.signals          → counts by topic + status; stale-flagged
//   - nervous_system.ledger           → source_type distribution + stale rows
//   - nervous_system.vault_embeddings → coverage check vs vault directory
//   - GitHub vault directory listing  → counts pages under raw/, wiki/, outputs/
// Sink:
//   - vault file at wiki/memory/curator/<for_date>.md
//   - audit_log row action='curator_sweep_complete' with counts
//
// Triggered:
//   - Inngest event 'curator/sweep.run' → curatorSweepRun
//   - HTTP POST /api/atrium/agents/run/curator

import { createClient } from '@supabase/supabase-js';
import { writeAgentMemory } from './runtime.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VAULT_REPO = 'freakngenius/unicron-knowledge';

export interface CuratorSweepResult {
  forDate: string;
  vaultPath: string;
  vaultStatus: number;
  signal_buckets: Array<{ topic: string; status: string; count: number; oldest_touched: string | null }>;
  ledger_buckets: Array<{ source_type: string; count: number; stale_count: number }>;
  vault_inventory: {
    raw_dirs: number;
    wiki_dirs: number;
    outputs_dirs: number;
    total_top_level_entries: number;
  };
  embedding_coverage: {
    total_embeddings: number;
    distinct_paths: number;
  };
  audit_log_id: string | null;
}

async function fetchVaultTopLevel(): Promise<CuratorSweepResult['vault_inventory']> {
  const token = process.env.GITHUB_VAULT_TOKEN;
  const inventory = { raw_dirs: 0, wiki_dirs: 0, outputs_dirs: 0, total_top_level_entries: 0 };
  if (!token) return inventory;
  for (const dir of ['raw', 'wiki', 'outputs'] as const) {
    try {
      const res = await fetch(`https://api.github.com/repos/${VAULT_REPO}/contents/${dir}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) continue;
      const items = (await res.json()) as Array<{ type: string }>;
      const count = Array.isArray(items) ? items.length : 0;
      inventory.total_top_level_entries += count;
      if (dir === 'raw') inventory.raw_dirs = count;
      if (dir === 'wiki') inventory.wiki_dirs = count;
      if (dir === 'outputs') inventory.outputs_dirs = count;
    } catch (err) {
      console.error(`[curator] vault ${dir} fetch:`, err instanceof Error ? err.message : err);
    }
  }
  return inventory;
}

export async function curatorSweep(opts: { forDate?: string } = {}): Promise<CuratorSweepResult> {
  const now = new Date();
  const forDate = opts.forDate ?? now.toISOString().split('T')[0];

  // 1. Signals bucketed by topic + status
  const { data: signalsRaw, error: signalsErr } = await supabase
    .schema('nervous_system')
    .from('signals')
    .select('topic, status, last_touched')
    .limit(1000);
  if (signalsErr) console.error('[curator] signals:', signalsErr.message);

  const signalBucketMap = new Map<string, { topic: string; status: string; count: number; oldest_touched: string | null }>();
  for (const s of signalsRaw ?? []) {
    const row = s as { topic: string | null; status: string | null; last_touched: string | null };
    const topic = row.topic ?? '(no-topic)';
    const status = row.status ?? '(no-status)';
    const k = `${topic}::${status}`;
    const existing = signalBucketMap.get(k);
    if (existing) {
      existing.count += 1;
      if (row.last_touched && (!existing.oldest_touched || row.last_touched < existing.oldest_touched)) {
        existing.oldest_touched = row.last_touched;
      }
    } else {
      signalBucketMap.set(k, { topic, status, count: 1, oldest_touched: row.last_touched });
    }
  }
  const signal_buckets = [...signalBucketMap.values()].sort((a, b) => b.count - a.count);

  // 2. Ledger by source_type
  const { data: ledgerRaw, error: ledgerErr } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .select('source_type, last_touched, created_at')
    .limit(2000);
  if (ledgerErr) console.error('[curator] ledger:', ledgerErr.message);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const ledgerBucketMap = new Map<string, { source_type: string; count: number; stale_count: number }>();
  for (const r of ledgerRaw ?? []) {
    const row = r as { source_type: string | null; last_touched: string | null; created_at: string };
    const st = row.source_type ?? '(no-source)';
    const existing = ledgerBucketMap.get(st) ?? { source_type: st, count: 0, stale_count: 0 };
    existing.count += 1;
    const touched = row.last_touched ?? row.created_at;
    if (touched && touched < thirtyDaysAgo) existing.stale_count += 1;
    ledgerBucketMap.set(st, existing);
  }
  const ledger_buckets = [...ledgerBucketMap.values()].sort((a, b) => b.count - a.count);

  // 3. Vault inventory (GitHub Contents API)
  const vault_inventory = await fetchVaultTopLevel();

  // 4. Embedding coverage
  const { data: embRaw, error: embErr } = await supabase
    .schema('nervous_system')
    .from('vault_embeddings')
    .select('path')
    .limit(5000);
  if (embErr) console.error('[curator] embeddings:', embErr.message);
  const distinctPaths = new Set((embRaw ?? []).map((r: { path?: string }) => r.path).filter(Boolean));
  const embedding_coverage = {
    total_embeddings: embRaw?.length ?? 0,
    distinct_paths: distinctPaths.size,
  };

  // Build report
  const totalSignals = signal_buckets.reduce((a, b) => a + b.count, 0);
  const totalLedger = ledger_buckets.reduce((a, b) => a + b.count, 0);
  const totalStaleLedger = ledger_buckets.reduce((a, b) => a + b.stale_count, 0);

  const lines: string[] = [];
  lines.push(`# Curator Sweep — ${forDate}`);
  lines.push('');
  lines.push(`Run timestamp: ${now.toISOString()}`);
  lines.push('');
  lines.push(`## Vault inventory`);
  lines.push('');
  lines.push(`- raw/: **${vault_inventory.raw_dirs}** entries`);
  lines.push(`- wiki/: **${vault_inventory.wiki_dirs}** entries`);
  lines.push(`- outputs/: **${vault_inventory.outputs_dirs}** entries`);
  lines.push(`- total top-level entries: **${vault_inventory.total_top_level_entries}**`);
  lines.push('');
  lines.push(`## Signal hygiene (${totalSignals} signals)`);
  lines.push('');
  if (signal_buckets.length === 0) {
    lines.push('_No signals in nervous_system.signals._');
  } else {
    for (const b of signal_buckets.slice(0, 20)) {
      lines.push(`- **${b.topic}** [${b.status}]: ${b.count} signals${b.oldest_touched ? `, oldest last_touched=${b.oldest_touched.split('T')[0]}` : ''}`);
    }
  }
  lines.push('');
  lines.push(`## Ledger hygiene (${totalLedger} rows; ${totalStaleLedger} stale)`);
  lines.push('');
  if (ledger_buckets.length === 0) {
    lines.push('_No ledger rows yet._');
  } else {
    for (const b of ledger_buckets) {
      lines.push(`- **${b.source_type}**: ${b.count} total, ${b.stale_count} stale (last_touched/created_at > 30d ago)`);
    }
  }
  lines.push('');
  lines.push(`## Embedding coverage`);
  lines.push('');
  lines.push(`- nervous_system.vault_embeddings rows: **${embedding_coverage.total_embeddings}**`);
  lines.push(`- distinct paths covered: **${embedding_coverage.distinct_paths}**`);
  lines.push('');
  lines.push(`---`);
  lines.push(`_Curator flags state for review; manual archive via ns_archive_topic is the only mutation path._`);

  const reportMd = lines.join('\n');

  const vaultResult = await writeAgentMemory('curator', reportMd, forDate);

  let audit_log_id: string | null = null;
  try {
    const { data: row, error } = await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'nervous_system.agents',
        action: 'curator_sweep_complete',
        payload: {
          for_date: forDate,
          vault_path: vaultResult.path,
          vault_status: vaultResult.status,
          total_signals: totalSignals,
          total_ledger: totalLedger,
          stale_ledger: totalStaleLedger,
          vault_inventory,
          embedding_coverage,
        },
      })
      .select('id')
      .single();
    if (error) console.error('[curator] audit_log:', error.message);
    else if (row) audit_log_id = row.id as string;
  } catch (err) {
    console.error('[curator] audit_log threw:', err instanceof Error ? err.message : err);
  }

  return {
    forDate,
    vaultPath: vaultResult.path,
    vaultStatus: vaultResult.status,
    signal_buckets,
    ledger_buckets,
    vault_inventory,
    embedding_coverage,
    audit_log_id,
  };
}
