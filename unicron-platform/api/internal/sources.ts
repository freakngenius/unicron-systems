// api/internal/sources.ts — server-side proxy for Pathfinder /api/sources/:id/ban-status.
//
// Replaces the client-side VITE_PATHFINDER_API_URL fetch in sourcesClient.ts.
// Client sends { source_id, ban_status }; this proxy maps source_id into the
// Pathfinder URL path and forwards ban_status in the body.
//
// Note: Pathfinder's /api/sources/ route is still behind Basic Auth as of
// this sprint. The proxy is wired now to eliminate the browser key leak;
// the middleware follow-up unblocks the live path.
//
// Sprint 4 hotfix — fix/sprint4-cross-app-ingest-hardening.

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
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    const { baseUrl, apiKey } = resolvePathfinder();

    const { source_id, ban_status } = req.body as {
      source_id?: string;
      ban_status?: string;
    };
    if (!source_id || !ban_status) {
      res.status(400).json({ ok: false, error: 'source_id and ban_status are required' });
      return;
    }

    const upstream = await fetch(
      `${baseUrl}/api/sources/${encodeURIComponent(source_id)}/ban-status`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-unicron-api-key': apiKey,
        },
        body: JSON.stringify({ ban_status }),
      },
    );
    await pipe(upstream, res);
  } catch (err) {
    handleError(err, res);
  }
}
