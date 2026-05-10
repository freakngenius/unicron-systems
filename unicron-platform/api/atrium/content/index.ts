// GET /api/atrium/content
// Reads markdown files from the unicron-knowledge vault wiki directory,
// finds files with `type: content | blog | social-post` in frontmatter,
// and returns a structured list for the Atrium Marketing > Content view.
//
// Sprint 6 Stream A.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import path from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContentItem {
  filename: string;
  relativePath: string;
  title: string;
  type: string;
  publishedDate: string | null;
  channel: string | null;
  traction: string | null;
  tags: string[];
}

// ── Frontmatter parser ────────────────────────────────────────────────────────
// Minimal YAML frontmatter parser — handles key: value lines between --- delimiters.

function parseFrontmatter(raw: string): Record<string, string | string[]> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const block = match[1];
  const result: Record<string, string | string[]> = {};
  for (const line of block.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    // Handle simple array syntax: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      result[key] = val
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
    } else {
      result[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
  return result;
}

const CONTENT_TYPES = new Set(['content', 'blog', 'social-post', 'article', 'post']);

// ── Vault root resolution ─────────────────────────────────────────────────────
// In production (Vercel), the vault is not on disk — return empty list gracefully.
// In local dev, resolve relative to this file's location in the repo.

function resolveVaultWikiDir(): string | null {
  // Explicit override via env
  if (process.env.VAULT_WIKI_DIR) return process.env.VAULT_WIKI_DIR;

  // Walk up from __dirname to find the repo root (contains unicron-knowledge/)
  // api/atrium/content/index.ts → ../../.. = unicron-platform/
  // Then unicron-knowledge is a sibling of unicron-platform/
  const apiDir = path.dirname(import.meta.url?.replace('file://', '') ?? '');
  if (!apiDir) return null;

  const candidates = [
    // Local dev: relative to this file
    path.resolve(apiDir, '../../../../unicron-knowledge/wiki'),
    // Dropbox path
    '/Users/keka/Dropbox/Projects/Unicron Systems/unicron-knowledge/wiki',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ── Recursive file walker ─────────────────────────────────────────────────────

function walkMarkdown(dir: string, base: string, results: ContentItem[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(full, base, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      let raw: string;
      try {
        raw = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const fm = parseFrontmatter(raw);
      const typeVal = typeof fm['type'] === 'string' ? fm['type'] : '';
      if (!CONTENT_TYPES.has(typeVal)) continue;

      const tagsRaw = fm['tags'];
      const tags = Array.isArray(tagsRaw)
        ? tagsRaw
        : typeof tagsRaw === 'string' && tagsRaw
          ? [tagsRaw]
          : [];

      results.push({
        filename: entry.name,
        relativePath: path.relative(base, full),
        title:
          typeof fm['title'] === 'string' && fm['title']
            ? fm['title']
            : entry.name.replace(/\.md$/, ''),
        type: typeVal,
        publishedDate:
          typeof fm['date'] === 'string' && fm['date'] ? fm['date'] : null,
        channel:
          typeof fm['channel'] === 'string' && fm['channel']
            ? fm['channel']
            : null,
        traction:
          typeof fm['traction'] === 'string' && fm['traction']
            ? fm['traction']
            : null,
        tags,
      });
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const wikiDir = resolveVaultWikiDir();

  if (!wikiDir) {
    // Vault not mounted — return empty list with hint
    res.status(200).json({
      items: [],
      vaultMounted: false,
      hint: 'Set VAULT_WIKI_DIR env var to the absolute path of unicron-knowledge/wiki/',
    });
    return;
  }

  const items: ContentItem[] = [];
  walkMarkdown(wikiDir, wikiDir, items);

  // Sort by publishedDate desc, then title asc
  items.sort((a, b) => {
    if (a.publishedDate && b.publishedDate) {
      return b.publishedDate.localeCompare(a.publishedDate);
    }
    if (a.publishedDate) return -1;
    if (b.publishedDate) return 1;
    return a.title.localeCompare(b.title);
  });

  res.status(200).json({ items, vaultMounted: true });
}
