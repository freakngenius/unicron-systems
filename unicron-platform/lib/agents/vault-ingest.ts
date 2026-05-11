// lib/agents/vault-ingest.ts — S4b + S4c
// Two Inngest-backed ingestion jobs against freakngenius/unicron-knowledge:
//   - vaultStatsSync     → counts docs in raw/, wiki/, outputs/ and tracks last commit
//   - continuityIngest   → parses wiki/memory/elder/continuity.md entries into rows
//
// Both reuse the existing GITHUB_VAULT_TOKEN env var (already in production for
// analystWikiSync). No new credential gap.

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const VAULT_REPO = 'freakngenius/unicron-knowledge';
const GITHUB_TOKEN = process.env.GITHUB_VAULT_TOKEN ?? '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function nervous(): AnyClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// ---------------------------------------------------------------------------
// S4b: vaultStatsSync
// ---------------------------------------------------------------------------

interface VaultStatsResult {
  status: 'ok' | 'awaiting_credentials' | 'error';
  raw_docs: number;
  wiki_docs: number;
  outputs_docs: number;
  total_bytes: number;
  last_commit_sha: string | null;
  last_commit_at: string | null;
  error?: string;
}

interface GhTreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  size?: number;
}

export async function vaultStatsSync(): Promise<VaultStatsResult> {
  if (!GITHUB_TOKEN) {
    await nervous().schema('nervous_system').from('audit_log').insert({
      action: 'vault_stats_awaiting_credentials',
      payload: { missing_env: ['GITHUB_VAULT_TOKEN'] },
    });
    return {
      status: 'awaiting_credentials',
      raw_docs: 0, wiki_docs: 0, outputs_docs: 0,
      total_bytes: 0, last_commit_sha: null, last_commit_at: null,
    };
  }

  try {
    const refRes = await fetch(
      `https://api.github.com/repos/${VAULT_REPO}/git/ref/heads/main`,
      { headers: ghHeaders() }
    );
    if (!refRes.ok) throw new Error(`ref/heads/main ${refRes.status}`);
    const ref = (await refRes.json()) as { object: { sha: string } };
    const headSha = ref.object.sha;

    const commitRes = await fetch(
      `https://api.github.com/repos/${VAULT_REPO}/git/commits/${headSha}`,
      { headers: ghHeaders() }
    );
    if (!commitRes.ok) throw new Error(`commits/${headSha} ${commitRes.status}`);
    const commit = (await commitRes.json()) as { committer: { date: string }; tree: { sha: string } };
    const treeSha = commit.tree.sha;
    const lastCommitAt = commit.committer.date;

    const treeRes = await fetch(
      `https://api.github.com/repos/${VAULT_REPO}/git/trees/${treeSha}?recursive=1`,
      { headers: ghHeaders() }
    );
    if (!treeRes.ok) throw new Error(`trees/${treeSha} ${treeRes.status}`);
    const tree = (await treeRes.json()) as { tree: GhTreeEntry[]; truncated: boolean };

    let rawDocs = 0;
    let wikiDocs = 0;
    let outputsDocs = 0;
    let totalBytes = 0;
    for (const entry of tree.tree) {
      if (entry.type !== 'blob') continue;
      if (!entry.path.endsWith('.md')) continue;
      totalBytes += entry.size ?? 0;
      if (entry.path.startsWith('raw/')) rawDocs++;
      else if (entry.path.startsWith('wiki/')) wikiDocs++;
      else if (entry.path.startsWith('outputs/')) outputsDocs++;
    }

    const row = {
      raw_docs: rawDocs,
      wiki_docs: wikiDocs,
      outputs_docs: outputsDocs,
      total_bytes: totalBytes,
      last_commit_sha: headSha,
      last_commit_at: lastCommitAt,
    };

    const { error: writeErr } = await nervous()
      .schema('nervous_system')
      .from('vault_stats')
      .insert(row);
    if (writeErr) throw new Error(`vault_stats insert: ${writeErr.message}`);

    await nervous().schema('nervous_system').from('audit_log').insert({
      action: 'vault_stats_ok',
      payload: { ...row, truncated: tree.truncated },
    });

    return { status: 'ok', ...row };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await nervous().schema('nervous_system').from('audit_log').insert({
      action: 'vault_stats_error',
      payload: { error: message },
    });
    return {
      status: 'error',
      raw_docs: 0, wiki_docs: 0, outputs_docs: 0,
      total_bytes: 0, last_commit_sha: null, last_commit_at: null,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// S4c: continuityIngest
// ---------------------------------------------------------------------------

interface ContinuityIngestResult {
  status: 'ok' | 'awaiting_credentials' | 'not_found' | 'error';
  entries_total: number;
  entries_new: number;
  error?: string;
}

interface ParsedEntry {
  entry_hash: string;
  entry_date: string | null;
  title: string | null;
  body: string;
  tags: string[];
}

/**
 * Parse `wiki/memory/elder/continuity.md` into discrete entries.
 *
 * Conventions supported:
 *   - Entries separated by a line containing only `---`.
 *   - Optional first line `# YYYY-MM-DD — Title` extracts date + title.
 *   - Trailing lines starting with `tags:` parsed as comma-separated tags.
 *   - Empty entries skipped.
 */
export function parseContinuityMarkdown(content: string): ParsedEntry[] {
  const parts = content.split(/^---\s*$/m).map((p) => p.trim()).filter(Boolean);
  const out: ParsedEntry[] = [];
  for (const part of parts) {
    const lines = part.split('\n');
    let title: string | null = null;
    let entryDate: string | null = null;
    const tags: string[] = [];
    const bodyLines: string[] = [];

    const headerMatch = lines[0]?.match(/^#\s+(\d{4}-\d{2}-\d{2})\s*[—-]\s*(.+)$/);
    let bodyStart = 0;
    if (headerMatch) {
      entryDate = headerMatch[1];
      title = headerMatch[2].trim();
      bodyStart = 1;
    } else if (lines[0]?.startsWith('# ')) {
      title = lines[0].slice(2).trim();
      bodyStart = 1;
    }

    for (let i = bodyStart; i < lines.length; i++) {
      const line = lines[i];
      const tagMatch = line.match(/^tags:\s*(.+)$/i);
      if (tagMatch) {
        tagMatch[1].split(',').forEach((t) => {
          const trimmed = t.trim();
          if (trimmed) tags.push(trimmed);
        });
        continue;
      }
      bodyLines.push(line);
    }

    const body = bodyLines.join('\n').trim();
    if (!body && !title) continue;

    const hash = createHash('sha256')
      .update([entryDate ?? '', title ?? '', body].join('\n'))
      .digest('hex');

    out.push({
      entry_hash: hash,
      entry_date: entryDate,
      title,
      body,
      tags,
    });
  }
  return out;
}

export async function continuityIngest(): Promise<ContinuityIngestResult> {
  if (!GITHUB_TOKEN) {
    await nervous().schema('nervous_system').from('audit_log').insert({
      action: 'continuity_ingest_awaiting_credentials',
      payload: { missing_env: ['GITHUB_VAULT_TOKEN'] },
    });
    return { status: 'awaiting_credentials', entries_total: 0, entries_new: 0 };
  }

  try {
    const path = 'wiki/memory/elder/continuity.md';
    const fileRes = await fetch(
      `https://api.github.com/repos/${VAULT_REPO}/contents/${path}`,
      { headers: ghHeaders() }
    );
    if (fileRes.status === 404) {
      await nervous().schema('nervous_system').from('audit_log').insert({
        action: 'continuity_ingest_not_found',
        payload: { path },
      });
      return { status: 'not_found', entries_total: 0, entries_new: 0 };
    }
    if (!fileRes.ok) throw new Error(`contents/${path} ${fileRes.status}`);

    const file = (await fileRes.json()) as { content: string };
    const content = Buffer.from(file.content, 'base64').toString('utf-8');
    const parsed = parseContinuityMarkdown(content);

    if (parsed.length === 0) {
      return { status: 'ok', entries_total: 0, entries_new: 0 };
    }

    const { data: existing } = await nervous()
      .schema('nervous_system')
      .from('continuity_log')
      .select('entry_hash')
      .in('entry_hash', parsed.map((p) => p.entry_hash));
    const existingHashes = new Set((existing ?? []).map((r: { entry_hash: string }) => r.entry_hash));
    const fresh = parsed.filter((p) => !existingHashes.has(p.entry_hash));

    if (fresh.length > 0) {
      const { error: writeErr } = await nervous()
        .schema('nervous_system')
        .from('continuity_log')
        .insert(fresh);
      if (writeErr) throw new Error(`continuity_log insert: ${writeErr.message}`);
    }

    await nervous().schema('nervous_system').from('audit_log').insert({
      action: 'continuity_ingest_ok',
      payload: { entries_total: parsed.length, entries_new: fresh.length },
    });

    return { status: 'ok', entries_total: parsed.length, entries_new: fresh.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await nervous().schema('nervous_system').from('audit_log').insert({
      action: 'continuity_ingest_error',
      payload: { error: message },
    });
    return { status: 'error', entries_total: 0, entries_new: 0, error: message };
  }
}
