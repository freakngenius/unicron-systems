// GET /api/atrium/brand-assets/file?path=<relativePath>
// Streams a brand asset file to the browser.
// Path param must be relative (no leading /) and must not escape the Brand/ root.
//
// Sprint 6 Stream A.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';

// ── MIME map ─────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.avif': 'image/avif',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.html': 'text/html',
  '.md':   'text/markdown',
  '.txt':  'text/plain',
};

function resolveBrandDir(): string | null {
  if (process.env.BRAND_DIR) return process.env.BRAND_DIR;
  const candidates = ['/Users/keka/Dropbox/Projects/Unicron Systems/Brand'];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const relPath = typeof req.query['path'] === 'string' ? req.query['path'] : '';
  if (!relPath) {
    res.status(400).json({ error: 'Missing path query param' });
    return;
  }

  const brandDir = resolveBrandDir();
  if (!brandDir) {
    res.status(503).json({ error: 'Brand directory not mounted on this server' });
    return;
  }

  // Security: resolve and verify the path stays within brandDir
  const resolved = path.resolve(brandDir, relPath);
  if (!resolved.startsWith(brandDir + path.sep) && resolved !== brandDir) {
    res.status(403).json({ error: 'Path traversal not allowed' });
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const filename = path.basename(resolved);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stream = createReadStream(resolved);
  stream.pipe(res);
}
