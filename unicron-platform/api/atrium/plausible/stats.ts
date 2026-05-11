// GET /api/atrium/plausible/stats — S5a
// Proxies the Plausible Stats API server-side so the browser does not see
// the API key. When PLAUSIBLE_API_KEY or PLAUSIBLE_SITE_ID is unset the
// endpoint returns 503 with `configured:false` so the UI can render the
// "Connect Plausible" CTA.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const PLAUSIBLE_BASE = 'https://plausible.io/api/v1/stats/aggregate';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.PLAUSIBLE_API_KEY;
  const siteId = process.env.PLAUSIBLE_SITE_ID;

  if (!apiKey || !siteId) {
    res.status(503).json({
      configured: false,
      message: 'Plausible is not connected. Set PLAUSIBLE_API_KEY and PLAUSIBLE_SITE_ID in Vercel env.',
    });
    return;
  }

  const period = typeof req.query.period === 'string' ? req.query.period : '30d';
  const metrics = 'visitors,visits,pageviews,bounce_rate';

  try {
    const url = `${PLAUSIBLE_BASE}?site_id=${encodeURIComponent(siteId)}&period=${encodeURIComponent(period)}&metrics=${metrics}`;
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({
        configured: true,
        error: `Plausible ${upstream.status}: ${text.slice(0, 200)}`,
      });
      return;
    }
    const body = await upstream.json();
    res.status(200).json({ configured: true, period, ...body });
  } catch (err) {
    res.status(500).json({
      configured: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
