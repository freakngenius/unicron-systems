// POST /api/atrium/wiki/edit/[slug]
// Edit a wiki page on disk and commit to vault repo.
// Body: { content: string, author?: string }
//
// Behaviour:
//  - Reads taboos.md from disk (VAULT_PATH) for taboo-check
//  - Rejects with 403 if content matches a taboo pattern
//  - Writes file on pass
//  - Commits via git (requires git in PATH and VAULT_PATH is a git repo)
//  - Logs every attempt (pass or fail) to nervous_system.audit_log
//
// Sprint 6 Stream C.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWikiRoot(): string | null {
  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) return null;
  return path.join(vaultPath, 'wiki');
}

function getVaultRoot(): string | null {
  return process.env.VAULT_PATH ?? null;
}

function resolveSlug(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw.join('/') : raw;
  const clean = s.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.includes('..')) return null;
  return clean;
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: 'nervous_system' } });
}

// ── Taboo check ───────────────────────────────────────────────────────────────
// Hard requirement: never skip this check for wiki edits.

interface TabooResult {
  blocked: boolean;
  reason?: string;
}

function loadTaboosFromDisk(vaultRoot: string): string[] {
  const taboosPath = path.join(vaultRoot, 'wiki', 'memory', 'taboos.md');
  try {
    const content = fs.readFileSync(taboosPath, 'utf-8');
    return content
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .map((l) => l.replace(/^-+\s*/, '').trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function tabooCheck(content: string, taboos: string[]): TabooResult {
  const lc = content.toLowerCase();
  for (const taboo of taboos) {
    if (taboo && lc.includes(taboo)) {
      return { blocked: true, reason: `Taboo match: "${taboo}"` };
    }
  }
  return { blocked: false };
}

// ── Audit log ─────────────────────────────────────────────────────────────────

async function auditLog(
  action: string,
  slug: string,
  outcome: 'pass' | 'fail',
  detail: Record<string, unknown>,
): Promise<void> {
  const sb = getServiceClient();
  if (!sb) return;
  try {
    await sb.from('audit_log').insert({
      action: `wiki_edit.${outcome}`,
      actor: detail.author ?? 'unknown',
      target_type: 'wiki_page',
      target_id: slug,
      payload: { action, slug, outcome, ...detail },
    });
  } catch {
    // Non-fatal — audit failure does not block write
  }
}

// ── Git commit ────────────────────────────────────────────────────────────────

function gitCommit(vaultRoot: string, filePath: string, message: string): void {
  // filePath is absolute; we need the repo-relative path
  const relPath = path.relative(vaultRoot, filePath);
  execSync(`git -C "${vaultRoot}" add "${relPath}"`, { stdio: 'pipe' });
  execSync(`git -C "${vaultRoot}" commit -m "${message.replace(/"/g, "'")}"`, {
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Atrium Wiki',
      GIT_AUTHOR_EMAIL: 'atrium@unicron.systems',
      GIT_COMMITTER_NAME: 'Atrium Wiki',
      GIT_COMMITTER_EMAIL: 'atrium@unicron.systems',
    },
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const wikiRoot = getWikiRoot();
  const vaultRoot = getVaultRoot();
  if (!wikiRoot || !vaultRoot) {
    res.status(503).json({ error: 'VAULT_PATH not configured' });
    return;
  }

  const slug = resolveSlug(req.query.slug);
  if (!slug) {
    res.status(400).json({ error: 'invalid slug' });
    return;
  }

  const filePath = path.join(wikiRoot, slug + '.md');
  if (!filePath.startsWith(path.resolve(wikiRoot))) {
    res.status(403).json({ error: 'path traversal denied' });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const newContent = body?.content;
  const author = typeof body?.author === 'string' ? body.author : 'unknown';

  if (typeof newContent !== 'string' || !newContent.trim()) {
    res.status(400).json({ error: 'Missing required field: content' });
    return;
  }

  // ── Taboo check (hard gate — never skip) ──────────────────────────────────
  const taboos = loadTaboosFromDisk(vaultRoot);
  const tabooResult = tabooCheck(newContent, taboos);

  if (tabooResult.blocked) {
    await auditLog('edit', slug, 'fail', {
      author,
      reason: tabooResult.reason,
    });
    res.status(403).json({
      error: 'Edit rejected: taboo check failed',
      reason: tabooResult.reason,
    });
    return;
  }

  // Read previous content for audit diff
  let contentBefore = '';
  try {
    contentBefore = fs.readFileSync(filePath, 'utf-8');
  } catch { /* file may not exist yet */ }

  // Write file
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, newContent, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await auditLog('edit', slug, 'fail', { author, reason: `write error: ${msg}` });
    res.status(500).json({ error: `failed to write file: ${msg}` });
    return;
  }

  // Git commit (best-effort — don't fail the response if git isn't available)
  let committed = false;
  try {
    gitCommit(vaultRoot, filePath, `wiki: edit ${slug} via Atrium (${author})`);
    committed = true;
  } catch (err) {
    console.warn('[wiki/edit] git commit failed:', err instanceof Error ? err.message : err);
  }

  await auditLog('edit', slug, 'pass', {
    author,
    committed,
    content_before_length: contentBefore.length,
    content_after_length: newContent.length,
  });

  res.status(200).json({ ok: true, slug, committed });
}
