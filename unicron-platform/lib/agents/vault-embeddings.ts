// lib/agents/vault-embeddings.ts — S5c
// Build + maintain semantic search index over the unicron-knowledge vault.
// Two callers:
//   - vaultEmbeddingsRebuild (Inngest cron, daily) — walk the vault tree,
//     compute embeddings via OpenAI text-embedding-3-small, upsert into
//     nervous_system.vault_embeddings keyed by path. Idempotent via
//     content_hash: rows whose hash matches existing rows are skipped.
//   - embedQuery — called by /api/atrium/vault-search to embed a
//     user-typed query before passing the vector to the RPC.
//
// Reuses GITHUB_VAULT_TOKEN for vault reads. OPENAI_API_KEY required for
// embeddings; if absent the rebuild writes an awaiting_credentials audit row.

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const VAULT_REPO = 'freakngenius/unicron-knowledge';
const GITHUB_TOKEN = process.env.GITHUB_VAULT_TOKEN ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

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

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  if (inputs.length === 0) return [];
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      dimensions: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as OpenAIEmbeddingResponse;
  const ordered = [...body.data].sort((a, b) => a.index - b.index);
  return ordered.map((d) => d.embedding);
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vec] = await embedTexts([query]);
  return vec;
}

interface RebuildResult {
  status: 'ok' | 'awaiting_credentials' | 'error';
  total_files: number;
  embedded_new: number;
  skipped_unchanged: number;
  error?: string;
}

interface GhTreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

const MAX_CONTENT_CHARS = 6_000;

export async function vaultEmbeddingsRebuild(): Promise<RebuildResult> {
  if (!GITHUB_TOKEN || !OPENAI_API_KEY) {
    await nervous().schema('nervous_system').from('audit_log').insert({
      action: 'vault_embeddings_awaiting_credentials',
      payload: {
        missing_env: [
          GITHUB_TOKEN ? null : 'GITHUB_VAULT_TOKEN',
          OPENAI_API_KEY ? null : 'OPENAI_API_KEY',
        ].filter(Boolean),
      },
    });
    return { status: 'awaiting_credentials', total_files: 0, embedded_new: 0, skipped_unchanged: 0 };
  }

  try {
    // Walk the vault tree to get list of .md blobs.
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
    const commit = (await commitRes.json()) as { tree: { sha: string } };

    const treeRes = await fetch(
      `https://api.github.com/repos/${VAULT_REPO}/git/trees/${commit.tree.sha}?recursive=1`,
      { headers: ghHeaders() }
    );
    if (!treeRes.ok) throw new Error(`trees ${treeRes.status}`);
    const tree = (await treeRes.json()) as { tree: GhTreeEntry[] };

    const candidates = tree.tree.filter(
      (e) => e.type === 'blob' && e.path.endsWith('.md') &&
        (e.path.startsWith('raw/') || e.path.startsWith('wiki/') || e.path.startsWith('outputs/'))
    );

    // Fetch existing hashes for paths that exist already.
    const sb = nervous();
    const { data: existingRows } = await sb
      .schema('nervous_system')
      .from('vault_embeddings')
      .select('path, content_hash');
    const existingByPath = new Map<string, string>(
      (existingRows ?? []).map((r: { path: string; content_hash: string }) => [r.path, r.content_hash])
    );

    let embeddedNew = 0;
    let skippedUnchanged = 0;
    // Batch embed in groups of 16 to keep request size sane.
    const BATCH = 16;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const contentsRaw = await Promise.all(
        batch.map(async (entry) => {
          const fileRes = await fetch(
            `https://api.github.com/repos/${VAULT_REPO}/git/blobs/${entry.sha}`,
            { headers: ghHeaders() }
          );
          if (!fileRes.ok) return null;
          const file = (await fileRes.json()) as { content: string };
          const content = Buffer.from(file.content, 'base64').toString('utf-8');
          return { entry, content };
        })
      );

      const toEmbed: Array<{
        path: string;
        content: string;
        content_hash: string;
        total_bytes: number;
      }> = [];
      for (const item of contentsRaw) {
        if (!item) continue;
        const trimmed = item.content.slice(0, MAX_CONTENT_CHARS);
        const hash = createHash('sha256').update(trimmed).digest('hex');
        if (existingByPath.get(item.entry.path) === hash) {
          skippedUnchanged++;
          continue;
        }
        toEmbed.push({
          path: item.entry.path,
          content: trimmed,
          content_hash: hash,
          total_bytes: item.entry.size ?? trimmed.length,
        });
      }

      if (toEmbed.length === 0) continue;

      const vectors = await embedTexts(toEmbed.map((d) => d.content));
      const rows = toEmbed.map((d, idx) => ({
        path: d.path,
        content: d.content,
        content_hash: d.content_hash,
        embedding: vectors[idx],
        model: EMBEDDING_MODEL,
        total_bytes: d.total_bytes,
        last_commit_sha: headSha,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertErr } = await sb
        .schema('nervous_system')
        .from('vault_embeddings')
        .upsert(rows, { onConflict: 'path' });
      if (upsertErr) throw new Error(`vault_embeddings upsert: ${upsertErr.message}`);
      embeddedNew += rows.length;
    }

    await sb.schema('nervous_system').from('audit_log').insert({
      action: 'vault_embeddings_ok',
      payload: { total_files: candidates.length, embedded_new: embeddedNew, skipped_unchanged: skippedUnchanged },
    });

    return {
      status: 'ok',
      total_files: candidates.length,
      embedded_new: embeddedNew,
      skipped_unchanged: skippedUnchanged,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await nervous().schema('nervous_system').from('audit_log').insert({
      action: 'vault_embeddings_error',
      payload: { error: message },
    });
    return { status: 'error', total_files: 0, embedded_new: 0, skipped_unchanged: 0, error: message };
  }
}
