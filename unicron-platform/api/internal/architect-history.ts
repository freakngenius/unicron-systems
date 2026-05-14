// api/internal/architect-history.ts — server-side proxy for Pathfinder
// /api/organizations/:slug/architect-history. Mirrors the pattern in
// api/internal/organizations.ts.
//
// SPEC: Company Docs/Metacron/SPEC - Customer Profile Architect History.md

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pipe, handleError, ProxyConfigError } from '../_lib/proxy.js';

function resolvePathfinder(): { baseUrl: string; apiKey: string } {
  const baseUrl = (
    process.env.PATHFINDER_INTERNAL_URL ?? 'https://unicron.systems/pathfinder'
  ).replace(/\/+$/, '');
  const apiKey = process.env.UNICRON_INGEST_API_KEY;
  if (!apiKey) throw new ProxyConfigError('UNICRON_INGEST_API_KEY is not set');
  return { baseUrl, apiKey };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
    if (!slug) {
      res.status(400).json({ ok: false, error: 'missing slug query param' });
      return;
    }
    const { baseUrl, apiKey } = resolvePathfinder();
    const upstream = await fetch(
      `${baseUrl}/api/organizations/${encodeURIComponent(slug)}/architect-history`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-unicron-api-key': apiKey,
        },
      },
    );
    await pipe(upstream, res);
  } catch (err) {
    handleError(err, res);
  }
}
