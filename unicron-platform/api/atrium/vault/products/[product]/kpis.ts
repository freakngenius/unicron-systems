// GET /api/atrium/vault/products/:product/kpis
// Reads unicron-knowledge/wiki/products/<product>/kpis.md from disk and returns
// the raw markdown as text/markdown.
//
// Resolves the vault root relative to this file: api/ lives at unicron-platform/api/,
// and unicron-knowledge is a sibling of unicron-platform/ at the monorepo root.
//
// Sprint 6 Stream B.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFile } from 'fs/promises';
import { join, resolve, normalize } from 'path';

// Allowlist of valid product slugs. Prevents path traversal.
const ALLOWED_PRODUCTS = new Set(['pathfinder', 'metacron', 'atrium']);

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

  const product = req.query['product'];
  if (typeof product !== 'string' || !ALLOWED_PRODUCTS.has(product)) {
    res.status(400).json({ error: `Unknown product: ${String(product)}` });
    return;
  }

  // Resolve path: this file is at unicron-platform/api/atrium/vault/products/[product]/kpis.ts
  // __dirname in Vercel serverless is the function's output dir; use process.cwd() fallback.
  // In production Vercel, process.cwd() is /var/task (repo root of the deployment).
  // The vault is committed as unicron-knowledge/ adjacent to unicron-platform/.
  //
  // We try two strategies:
  //  1. process.cwd() + '../unicron-knowledge/...'  (monorepo layout on Vercel)
  //  2. process.cwd() + 'unicron-knowledge/...'     (if cwd IS the repo root)

  // Atrium audit fix item #2: the canonical KPI file location is
  // wiki/architecture/products/<product>/kpis.md (where the unicron-knowledge
  // repo actually stores them). Keep wiki/products/<product>/kpis.md as a
  // fallback for the original spec path so older vault layouts still resolve.
  const relativePaths = [
    join('wiki', 'architecture', 'products', product, 'kpis.md'),
    join('wiki', 'products', product, 'kpis.md'),
  ];

  // Each relative path expands into three deploy-layout candidates.
  const candidates: string[] = [];
  for (const relativePath of relativePaths) {
    candidates.push(
      // Vercel deploys from unicron-platform/ directory — vault is one level up
      resolve(process.cwd(), '..', 'unicron-knowledge', relativePath),
      // Deployed from monorepo root
      resolve(process.cwd(), 'unicron-knowledge', relativePath),
      // Local dev: __dirname is unicron-platform/api/atrium/vault/products/[product]/
      resolve(__dirname, '..', '..', '..', '..', '..', '..', 'unicron-knowledge', relativePath),
    );
  }

  // Validate none of the resolved paths escape unicron-knowledge/wiki/.../<product>/.
  const allowedSuffixes = relativePaths.map((p) => join('unicron-knowledge', p));
  for (const candidate of candidates) {
    const normalised = normalize(candidate);
    if (!allowedSuffixes.some((suffix) => normalised.includes(suffix))) {
      // Path traversal attempt — skip
      continue;
    }
    try {
      const content = await readFile(normalised, 'utf-8');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.status(200).send(content);
      return;
    } catch {
      // Try next candidate
    }
  }

  // All candidates failed — return 404 with helpful note
  res.status(404).json({
    error: `KPI file not found for product: ${product}`,
    note:
      'Expected at unicron-knowledge/wiki/architecture/products/<product>/kpis.md ' +
      '(or wiki/products/<product>/kpis.md as legacy fallback)',
    tried: candidates,
  });
}
