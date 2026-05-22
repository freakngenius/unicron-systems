// POST /api/quick-capture — server-side proxy from Atrium to Pathfinder's ingest endpoint.
//
// Bug fix (2026-05-22):
//   Initial attempt landed as /api/ingest in PR #457 (commit c83a5aa6). That
//   path resolved to a Vercel-level 404 on POST while OPTIONS/GET reached the
//   function — confirmed via curl:
//     OPTIONS /api/ingest → 204 (with our CORS headers)
//     GET     /api/ingest → 405 (our handler returning method-not-allowed)
//     POST    /api/ingest → 404 NOT_FOUND served by Vercel edge (text/plain,
//                            x-vercel-cache: MISS, before reaching the function)
//   /api/inngest POST routes fine in the same project, so the most likely
//   cause is a stale routing entry for /api/ingest in this Vercel project.
//   Renaming the endpoint sidesteps the conflict completely without depending
//   on Vercel-side cleanup. QuickCapture.tsx is updated in the same commit
//   to call /api/quick-capture.
//
// The Pathfinder ingest handler at Pathfinder/app/api/ingest/route.ts is
// still the real downstream — this file just proxies to it with the
// x-unicron-api-key header injected from server-side env.
//
// This proxy:
//   1. Accepts the same JSON body QuickCapture sends.
//   2. Adds the x-unicron-api-key header from server-side env so the browser
//      never sees the shared secret.
//   3. Forwards to ${PATHFINDER_INGEST_URL} (defaults to the production
//      Pathfinder Vercel project).
//   4. Streams the response back unchanged.
//
// Env vars:
//   PATHFINDER_INGEST_URL        — base URL of the Pathfinder project
//                                  (default: https://pathfinder-ashy.vercel.app)
//   UNICRON_INTERNAL_API_KEY     — shared secret matched against the
//                                  x-unicron-api-key header on the
//                                  Pathfinder side.

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Pathfinder runs on Next.js with basePath '/pathfinder' (see Pathfinder/
// next.config.js). Routes live at /pathfinder/api/* on its Vercel project.
// PATHFINDER_INGEST_URL may include the basePath already; if not, we append.
const PATHFINDER_BASE =
  process.env.PATHFINDER_INGEST_URL ?? 'https://pathfinder-ashy.vercel.app/pathfinder';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Pathfinder's /api/ingest endpoint authenticates against
  // UNICRON_INGEST_API_KEY (see Pathfinder/app/api/ingest/route.ts auth
  // comment). That's a different env name from UNICRON_INTERNAL_API_KEY
  // (which Pathfinder's action-items PATCH uses). Prefer the canonical
  // INGEST var; fall back to INTERNAL for projects that already have only
  // that variable set.
  const apiKey =
    process.env.UNICRON_INGEST_API_KEY ?? process.env.UNICRON_INTERNAL_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      configured: false,
      error:
        'Quick Capture is not configured. Set UNICRON_INGEST_API_KEY on the ' +
        'unicron-platform Vercel project — must match the same value already ' +
        'set on the Pathfinder project (which is where /api/ingest validates).',
    });
    return;
  }

  // Forward the body verbatim. req.body may be string OR object depending on
  // Vercel's bodyParser; normalize to a JSON string.
  let bodyText: string;
  if (typeof req.body === 'string') {
    bodyText = req.body;
  } else if (req.body && typeof req.body === 'object') {
    bodyText = JSON.stringify(req.body);
  } else {
    res.status(400).json({ error: 'Missing JSON body' });
    return;
  }

  try {
    const upstream = await fetch(`${PATHFINDER_BASE}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-unicron-api-key': apiKey,
      },
      body: bodyText,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      error: 'Pathfinder ingest proxy failed',
      upstream: PATHFINDER_BASE,
      detail: msg,
    });
  }
}
