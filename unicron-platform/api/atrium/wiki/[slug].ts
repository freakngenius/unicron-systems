// GET  /api/atrium/wiki/[slug] — render wiki page content
// POST /api/atrium/wiki/[slug]/edit is in [slug]/edit.ts (Vercel routes sub-path)
// Sprint 6 Stream C.
//
// Slug is the filename without .md, supporting nested paths via URL encoding.
// e.g. GET /api/atrium/wiki/memory%2Ftaboos → wiki/memory/taboos.md
// Vercel passes the catch-all slug via req.query.slug (string or string[]).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { ghFetchFile } from './_github.js';

function getWikiRoot(): string | null {
  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) return null;
  return path.join(vaultPath, 'wiki');
}

function resolveSlug(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw.join('/') : raw;
  // Sanitize: no absolute paths, no ../ traversal
  const clean = s.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.includes('..')) return null;
  return clean;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const slug = resolveSlug(req.query.slug);
  if (!slug) {
    res.status(400).json({ error: 'invalid slug' });
    return;
  }

  const wikiRoot = getWikiRoot();

  if (wikiRoot && fs.existsSync(wikiRoot)) {
    // Filesystem path
    const filePath = path.join(wikiRoot, slug + '.md');
    if (!filePath.startsWith(path.resolve(wikiRoot))) {
      res.status(403).json({ error: 'path traversal denied' });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: `wiki page not found: ${slug}` });
      return;
    }
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `failed to read file: ${msg}` });
      return;
    }
    let mtime: string | null = null;
    try { mtime = fs.statSync(filePath).mtime.toISOString(); } catch { /* noop */ }
    res.status(200).json({ slug, content, mtime });
    return;
  }

  // GitHub fallback
  try {
    const repoPath = `wiki/${slug}.md`;
    const result = await ghFetchFile(repoPath);
    if (!result) {
      res.status(404).json({ error: `wiki page not found: ${slug}` });
      return;
    }
    res.status(200).json({ slug, content: result.content, mtime: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `wiki unavailable: ${msg}` });
  }
}
