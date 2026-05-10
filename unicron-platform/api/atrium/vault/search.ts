// GET /api/atrium/vault/search?q=<query>&tags=<comma-separated-tags>
// Full-text + tag search across wiki markdown files.
// Falls back to GitHub API when VAULT_PATH is unavailable (Vercel cloud).
// Returns: { results: SearchResult[] }
// Sprint 6 Stream C.

import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { ghListWikiFiles, ghFetchBlob } from '../wiki/_github.js';

export interface SearchResult {
  slug: string;
  title: string;
  path: string;
  excerpt: string;
  tags: string[];
  created_at: string | null;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = /^---\s*\n([\s\S]*?)\n---/m.exec(content);
  if (!match) return {};
  const fm: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim();
    const val = line.slice(sep + 1).trim().replace(/^["']|["']$/g, '');
    if (key) fm[key] = val;
  }
  return fm;
}

function parseTags(fm: Record<string, string>): string[] {
  const raw = fm.tags ?? '';
  if (!raw) return [];
  // Handle both: tags: [a, b, c] and tags: a, b, c
  return raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function extractTitle(content: string, slug: string): string {
  const fm = parseFrontmatter(content);
  if (fm.title) return fm.title;
  const headingMatch = /^#\s+(.+)$/m.exec(content);
  if (headingMatch) return headingMatch[1].trim();
  return slug.split('/').pop()?.replace(/-/g, ' ') ?? slug;
}

function makeExcerpt(content: string, query: string, maxLen = 200): string {
  // Strip frontmatter
  const body = content.replace(/^---[\s\S]*?---\s*\n?/, '').trim();
  if (!query) {
    return body.slice(0, maxLen) + (body.length > maxLen ? '…' : '');
  }
  const lc = body.toLowerCase();
  const idx = lc.indexOf(query.toLowerCase());
  if (idx < 0) return body.slice(0, maxLen) + (body.length > maxLen ? '…' : '');
  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + 140);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return prefix + body.slice(start, end) + suffix;
}

interface FileEntry {
  slug: string;
  fullPath: string | null;
  content: string | null;
  mtime: Date;
}

function collectFiles(wikiRoot: string, dir: string, entries: FileEntry[]): void {
  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of dirEntries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(wikiRoot, fullPath, entries);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      let mtime = new Date(0);
      try {
        mtime = fs.statSync(fullPath).mtime;
      } catch { /* noop */ }
      const relativePath = path.relative(wikiRoot, fullPath);
      const slug = relativePath.replace(/\\/g, '/').replace(/\.md$/, '');
      entries.push({ slug, fullPath, content: null, mtime });
    }
  }
}

async function collectFromGitHub(): Promise<FileEntry[]> {
  const files = await ghListWikiFiles();
  const entries = await Promise.all(
    files.map(async (file) => {
      const content = await ghFetchBlob(file.sha);
      const slug = file.path.replace(/^wiki\//, '').replace(/\.md$/, '');
      return { slug, fullPath: null, content, mtime: new Date(0) };
    }),
  );
  return entries;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS' });
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    jsonResponse(res, 405, { error: 'method not allowed' });
    return;
  }

  const parsed = url.parse(req.url ?? '', true);
  const query = (parsed.query.q as string | undefined) ?? '';
  const tagsParam = (parsed.query.tags as string | undefined) ?? '';
  const filterTags = tagsParam
    ? tagsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  const vaultPath = process.env.VAULT_PATH;
  const wikiRoot = vaultPath ? path.join(vaultPath, 'wiki') : null;

  let fileEntries: FileEntry[] = [];

  if (wikiRoot && fs.existsSync(wikiRoot)) {
    collectFiles(wikiRoot, wikiRoot, fileEntries);
  } else {
    try {
      fileEntries = await collectFromGitHub();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 503, { error: `vault unavailable: ${msg}` });
      return;
    }
  }

  // Sort by mtime descending (most recent first; GitHub entries have mtime=0 so order is stable)
  fileEntries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const results: SearchResult[] = [];

  for (const entry of fileEntries) {
    let content = entry.content;
    if (content === null) {
      try {
        content = fs.readFileSync(entry.fullPath!, 'utf-8');
      } catch {
        continue;
      }
    }

    const fm = parseFrontmatter(content);
    const tags = parseTags(fm);

    // Tag filter
    if (filterTags.length > 0) {
      const lcTags = tags.map((t) => t.toLowerCase());
      if (!filterTags.some((ft) => lcTags.includes(ft))) continue;
    }

    // Text filter
    if (query) {
      const lc = content.toLowerCase();
      if (!lc.includes(query.toLowerCase())) continue;
    }

    results.push({
      slug: entry.slug,
      title: extractTitle(content, entry.slug),
      path: entry.slug + '.md',
      excerpt: makeExcerpt(content, query),
      tags,
      created_at: fm.date ?? fm.created_at ?? (entry.mtime.getTime() > 0 ? entry.mtime.toISOString() : null),
    });
  }

  jsonResponse(res, 200, { results });
}
