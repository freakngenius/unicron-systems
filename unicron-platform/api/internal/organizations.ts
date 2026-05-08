// api/internal/organizations.ts — server-side proxy for Pathfinder /api/organizations.
//
// Replaces the client-side VITE_PATHFINDER_API_URL fetch in customersClient.ts.
// Supports GET (list all or single by ?slug=) and POST (create).
//
// Note: Pathfinder's /api/organizations route is still behind Basic Auth as of
// this sprint. These proxy calls will 401 until that route is added to the
// middleware exclusion list. The proxy is wired now to eliminate the browser
// key leak; the middleware follow-up unblocks the live path.
//
// Sprint 4 hotfix — fix/sprint4-cross-app-ingest-hardening.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serializeBody, pipe, handleError, ProxyConfigError } from '../_lib/proxy.js';

function resolvePathfinder(): { baseUrl: string; apiKey: string } {
  const baseUrl = (
    process.env.PATHFINDER_INTERNAL_URL ?? 'https://unicron.systems/pathfinder'
  ).replace(/\/+$/, '');
  const apiKey = process.env.UNICRON_INGEST_API_KEY;
  if (!apiKey) throw new ProxyConfigError('UNICRON_INGEST_API_KEY is not set');
  return { baseUrl, apiKey };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    const { baseUrl, apiKey } = resolvePathfinder();

    // GET /api/internal/organizations?slug=foo → Pathfinder GET /api/organizations/foo
    // GET /api/internal/organizations           → Pathfinder GET /api/organizations
    const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
    const upstreamPath = slug
      ? `/api/organizations/${encodeURIComponent(slug)}`
      : '/api/organizations';

    const body = req.method === 'POST' ? serializeBody(req) : undefined;
    const upstream = await fetch(`${baseUrl}${upstreamPath}`, {
      method: req.method,
      headers: {
        accept: 'application/json',
        'x-unicron-api-key': apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body,
    });
    await pipe(upstream, res);
  } catch (err) {
    handleError(err, res);
  }
}
