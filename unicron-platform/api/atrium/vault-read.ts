// GET /api/atrium/vault-read?path=<encoded relative path>
// Sprint 7.5 Symptom 1 follow-up — Atrium UI reads digest files from the
// private freakngenius/unicron-knowledge repo via this server-side proxy
// instead of the public raw.githubusercontent.com URL (which 404s anon).
//
// Whitelist: paths must be under wiki/memory/ or wiki/research/ (no escapes).

import type { VercelRequest, VercelResponse } from '@vercel/node';

const VAULT_REPO = 'freakngenius/unicron-knowledge';
const ALLOWED_PREFIXES = ['wiki/memory/', 'wiki/research/'];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const pathRaw = (req.query['path'] as string | undefined) ?? '';
  if (!pathRaw) {
    res.status(400).json({ ok: false, error: 'path query param required' });
    return;
  }
  if (pathRaw.includes('..') || pathRaw.startsWith('/')) {
    res.status(400).json({ ok: false, error: 'path must be a vault-relative path' });
    return;
  }
  if (!ALLOWED_PREFIXES.some((p) => pathRaw.startsWith(p))) {
    res.status(400).json({ ok: false, error: `path must start with one of: ${ALLOWED_PREFIXES.join(', ')}` });
    return;
  }

  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) {
    res.status(500).json({ ok: false, error: 'GITHUB_VAULT_TOKEN not configured' });
    return;
  }

  try {
    const ghRes = await fetch(`https://api.github.com/repos/${VAULT_REPO}/contents/${pathRaw}?ref=main`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (ghRes.status === 404) {
      res.status(404).json({ ok: false, error: 'not found', path: pathRaw });
      return;
    }
    if (!ghRes.ok) {
      const detail = await ghRes.text();
      res.status(502).json({ ok: false, error: `vault upstream HTTP ${ghRes.status}`, detail: detail.slice(0, 200) });
      return;
    }
    const payload = (await ghRes.json()) as { content?: string; sha?: string; encoding?: string };
    if (!payload.content || payload.encoding !== 'base64') {
      res.status(502).json({ ok: false, error: 'unexpected vault payload shape' });
      return;
    }
    const text = Buffer.from(payload.content, 'base64').toString('utf-8');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
