// api/internal/ingest.ts — server-side proxy for Pathfinder /api/ingest.
//
// Moves UNICRON_INGEST_API_KEY out of the browser bundle. The client calls
// this route; this route attaches the key and forwards to Pathfinder.
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
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    const { baseUrl, apiKey } = resolvePathfinder();
    const body = serializeBody(req);
    const upstream = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-unicron-api-key': apiKey,
      },
      body,
    });
    await pipe(upstream, res);
  } catch (err) {
    handleError(err, res);
  }
}
