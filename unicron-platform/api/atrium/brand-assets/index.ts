// GET /api/atrium/brand-assets
// Recursively lists files from the Brand/ directory.
// Returns: path, name, extension, size, folder.
//
// Sprint 6 Stream A.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import path from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BrandAsset {
  name: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  folder: string;
  isImage: boolean;
}

// ── Brand root resolution ─────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico', '.avif']);

function resolveBrandDir(): string | null {
  if (process.env.BRAND_DIR) return process.env.BRAND_DIR;
  const candidates = [
    '/Users/keka/Dropbox/Projects/Unicron Systems/Brand',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── Recursive walker ──────────────────────────────────────────────────────────

function walkBrand(dir: string, base: string, results: BrandAsset[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip .DS_Store etc.
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkBrand(full, base, results);
    } else if (entry.isFile()) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      const rel = path.relative(base, full);
      const ext = path.extname(entry.name).toLowerCase();
      const parts = rel.split(path.sep);
      const folder = parts.length > 1 ? parts[0] : 'Root';
      results.push({
        name: entry.name,
        relativePath: rel,
        extension: ext,
        sizeBytes: stat.size,
        folder,
        isImage: IMAGE_EXTS.has(ext),
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

  const brandDir = resolveBrandDir();
  if (!brandDir) {
    res.status(200).json({
      assets: [],
      brandDirMounted: false,
      hint: 'Set BRAND_DIR env var to the absolute path of the Brand/ directory.',
    });
    return;
  }

  const assets: BrandAsset[] = [];
  walkBrand(brandDir, brandDir, assets);

  // Sort: folder asc, then name asc
  assets.sort((a, b) =>
    a.folder !== b.folder
      ? a.folder.localeCompare(b.folder)
      : a.name.localeCompare(b.name),
  );

  res.status(200).json({ assets, brandDirMounted: true, brandDir });
}
