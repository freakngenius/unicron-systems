// api/atrium/network.ts — Sprint 5 Stream E
// GET /api/atrium/network — parse vault/Memory/people/*.md files and return contacts.
//
// Reads from VAULT_PATH env var (or a GitHub vault repo as fallback).
// Returns an array of contact objects parsed from markdown frontmatter or filenames.

import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';

interface Contact {
  id: string;
  name: string;
  role: string | null;
  relationship: string | null;
  introduced_by: string | null;
  introduced_to: string[] | null;
  last_touch: string | null;
  file_modified: string | null;
  raw_intro_note: string | null;
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

/** Derive a display name from a filename (remove .md, replace hyphens/underscores). */
function nameFromFile(filename: string): string {
  return filename
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function readFromDisk(vaultPath: string): Contact[] {
  const peoplePath = path.join(vaultPath, 'Memory', 'people');
  if (!fs.existsSync(peoplePath)) return [];

  const files = fs.readdirSync(peoplePath).filter((f) => f.endsWith('.md'));
  const contacts: Contact[] = [];

  for (const file of files) {
    const filePath = path.join(peoplePath, file);
    let content = '';
    let mtime: Date | null = null;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
      const stat = fs.statSync(filePath);
      mtime = stat.mtime;
    } catch {
      continue;
    }

    const fm = parseFrontmatter(content);
    const fileBaseName = file.replace(/\.md$/i, '');

    // Extract intro note: first paragraph after frontmatter
    const bodyMatch = /^---[\s\S]*?---\s*\n([\s\S]*)/m.exec(content);
    let introNote: string | null = null;
    if (bodyMatch) {
      const firstPara = bodyMatch[1].trim().split(/\n\n/)[0] ?? '';
      introNote = firstPara.slice(0, 200) || null;
    }

    // Parse introduced_to as array (comma-separated)
    const introducedToRaw = fm.introduced_to ?? fm.introduced ?? null;
    const introducedTo = introducedToRaw
      ? introducedToRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    contacts.push({
      id: fileBaseName,
      name: fm.name ?? nameFromFile(file),
      role: fm.role ?? fm.title ?? null,
      relationship: fm.relationship ?? fm.type ?? null,
      introduced_by: fm.introduced_by ?? fm.intro_by ?? null,
      introduced_to: introducedTo,
      last_touch: fm.last_touch ?? fm.last_contact ?? null,
      file_modified: mtime ? mtime.toISOString() : null,
      raw_intro_note: introNote,
    });
  }

  return contacts;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    jsonResponse(res, 405, { error: 'method not allowed' });
    return;
  }

  const vaultPath = process.env.VAULT_PATH;

  if (vaultPath) {
    try {
      const contacts = readFromDisk(vaultPath);
      jsonResponse(res, 200, contacts);
      return;
    } catch (e) {
      console.error('[/api/atrium/network] disk read error:', e);
      // Fall through to empty response
    }
  }

  // No vault path configured — return empty list (UI shows placeholder)
  jsonResponse(res, 200, []);
}
