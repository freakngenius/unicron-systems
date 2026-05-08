// GET /api/atrium/taboos
// Server-side proxy that fetches taboos.md from the unicron-knowledge GitHub vault.
// Uses GITHUB_VAULT_TOKEN (server-only env var) — the vault repo may be private.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'GITHUB_VAULT_TOKEN not configured' });
    return;
  }

  let vaultRes: Response;
  try {
    vaultRes = await fetch(
      'https://api.github.com/repos/freakngenius/unicron-knowledge/contents/wiki/memory/taboos.md',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3.raw',
          'User-Agent': 'unicron-platform/1.0',
        },
      },
    );
  } catch (err) {
    console.error('[/api/atrium/taboos] fetch error:', err);
    res.status(502).json({ error: 'failed to reach GitHub API' });
    return;
  }

  if (!vaultRes.ok) {
    if (vaultRes.status === 404) {
      res.status(404).json({ error: 'taboos.md not found in vault' });
    } else {
      res.status(502).json({ error: `vault returned ${vaultRes.status}` });
    }
    return;
  }

  const content = await vaultRes.text();
  res.status(200).json({ content });
}
