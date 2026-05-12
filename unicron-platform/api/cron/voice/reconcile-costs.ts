// GET /api/cron/voice/reconcile-costs
//
// Daily cron. Backfills cost_usd / cost_breakdown / vapi_org_id / started_at on
// any voice_call_transcripts row that has a vapi_call_id but no cost_usd.
//
// Auth (bypasses requireVoiceAccess):
//   - Vercel cron pings carry x-vercel-cron: 1 — allowed.
//   - Manual triggers can pass Authorization: Bearer $CRON_SECRET or
//     x-cron-secret: $CRON_SECRET.
//   - In dev/preview (VERCEL_ENV != 'production') with no CRON_SECRET configured,
//     allows unauthenticated calls for local testing — matches the
//     api/cron/voice/procurement-pull.ts pattern.
//
// Caps: walks up to 200 rows per invocation (configurable via ?max= query).
// Schedule (vercel.json): 0 3 * * * UTC.
//
// Translated from prototype src/app/api/cron/reconcile-vapi-costs/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPathfinderServiceClient } from '../../_lib/supabaseAdmin.js';
import { reconcileVapiCosts } from '../../../src/lib/voice/reconcileVapiCosts.js';

function authorized(req: VercelRequest): boolean {
  if (req.headers['x-vercel-cron']) return true;
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return process.env.VERCEL_ENV !== 'production';
  }
  const auth = req.headers.authorization;
  if (auth === `Bearer ${expected}`) return true;
  const xcs = req.headers['x-cron-secret'];
  const xcsStr = Array.isArray(xcs) ? xcs[0] : xcs;
  return xcsStr === expected;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false, error: 'VAPI_API_KEY not configured' });
    return;
  }

  const maxRaw = req.query.max;
  const maxStr = Array.isArray(maxRaw) ? maxRaw[0] : maxRaw;
  const maxParam = Number(maxStr ?? 200);
  const max = Number.isFinite(maxParam) ? maxParam : 200;

  const sb = getPathfinderServiceClient();

  const startedAt = new Date().toISOString();
  const result = await reconcileVapiCosts(sb, apiKey, { max });
  const finishedAt = new Date().toISOString();

  res.status(result.ok ? 200 : 500).json({
    ...result,
    started_at: startedAt,
    finished_at: finishedAt,
  });
}
