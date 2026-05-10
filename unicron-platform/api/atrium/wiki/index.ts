// GET /api/atrium/wiki
// List all wiki pages from unicron-knowledge/wiki/ recursively.
// Falls back to GitHub API when VAULT_PATH is unavailable (Vercel cloud).
// Returns: { pages: WikiPage[] }
// Sprint 6 Stream C.

import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ghListWikiFiles } from './_github.js';

export interface WikiPage {
  slug: string;
  title: string;
  path: string;
  frontmatter: Record<string, string>;
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

/** Parse YAML-ish frontmatter from markdown: ---\nkey: value\n--- */
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

/** Extract title: frontmatter title > first # heading > slug */
function extractTitle(content: string, slug: string): string {
  const fm = parseFrontmatter(content);
  if (fm.title) return fm.title;
  const headingMatch = /^#\s+(.+)$/m.exec(content);
  if (headingMatch) return headingMatch[1].trim();
  return slug.split('/').pop()?.replace(/-/g, ' ') ?? slug;
}

/** Recursively collect all .md files under wikiRoot, returning WikiPage[] */
function collectPages(wikiRoot: string, dir: string, pages: WikiPage[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPages(wikiRoot, fullPath, pages);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relativePath = path.relative(wikiRoot, fullPath);
      // slug = relative path without .md extension, forward slashes
      const slug = relativePath.replace(/\\/g, '/').replace(/\.md$/, '');
      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }
      pages.push({
        slug,
        title: extractTitle(content, slug),
        path: relativePath.replace(/\\/g, '/'),
        frontmatter: parseFrontmatter(content),
      });
    }
  }
}

/** Derive a display title from slug when blob content is unavailable. */
function titleFromSlug(slug: string): string {
  const name = slug.split('/').pop() ?? slug;
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function listFromGitHub(): Promise<WikiPage[]> {
  // Use tree listing only (1 request) — avoids N blob fetches that exhaust
  // the 60 req/hr unauthenticated GitHub rate limit.
  const files = await ghListWikiFiles();
  return files.map((file) => {
    const slug = file.path.replace(/^wiki\//, '').replace(/\.md$/, '');
    return {
      slug,
      title: titleFromSlug(slug),
      path: file.path.replace(/^wiki\//, ''),
      frontmatter: {},
    };
  });
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

  let pages: WikiPage[] = [];

  const vaultPath = process.env.VAULT_PATH;
  const wikiRoot = vaultPath ? path.join(vaultPath, 'wiki') : null;

  if (wikiRoot && fs.existsSync(wikiRoot)) {
    collectPages(wikiRoot, wikiRoot, pages);
  } else {
    try {
      pages = await listFromGitHub();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 503, { error: `wiki unavailable: ${msg}` });
      return;
    }
  }

  // Sort: _master-index first, then alphabetically by slug
  pages.sort((a, b) => {
    if (a.slug === '_master-index') return -1;
    if (b.slug === '_master-index') return 1;
    return a.slug.localeCompare(b.slug);
  });

  jsonResponse(res, 200, { pages });
}
