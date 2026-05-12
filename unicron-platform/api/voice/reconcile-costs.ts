// POST /api/voice/reconcile-costs   manual reconcile run
// GET  /api/voice/reconcile-costs   status counters (rows missing cost vs total with vapi_call_id)
//
// Translated from prototype src/app/api/vapi/reconcile-costs/route.ts. Atrium
// gates the route behind requireVoiceAccess (bearer JWT) like the rest of the
// /api/voice/* surface.
//
// POST body (all optional): { transcript_ids?: string[], max?: number }
//   - transcript_ids: only reconcile these specific rows.
//   - max: cap how many missing-cost rows we fetch (default 50, ceiling 200).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin.js';
import { reconcileVapiCosts } from '../../src/lib/voice/reconcileVapiCosts.js';

function safeParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const sb = getPathfinderServiceClient();

  if (req.method === 'GET') {
    const { count: missing, error: e1 } = await sb
      .from('voice_call_transcripts')
      .select('id', { count: 'exact', head: true })
      .not('vapi_call_id', 'is', null)
      .is('cost_usd', null);
    const { count: total, error: e2 } = await sb
      .from('voice_call_transcripts')
      .select('id', { count: 'exact', head: true })
      .not('vapi_call_id', 'is', null);
    if (e1 || e2) {
      res.status(500).json({ ok: false, error: e1?.message ?? e2?.message });
      return;
    }
    res.status(200).json({
      ok: true,
      total_with_vapi_id: total ?? 0,
      missing_cost: missing ?? 0,
    });
    return;
  }

  // POST
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false, error: 'VAPI_API_KEY not configured' });
    return;
  }

  const raw = typeof req.body === 'string' ? safeParseJson(req.body) : (req.body as Record<string, unknown> | null);
  const body = raw ?? {};

  const transcriptIds = Array.isArray(body.transcript_ids)
    ? (body.transcript_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  const maxRaw = body.max;
  const max = typeof maxRaw === 'number' ? maxRaw : Number(maxRaw ?? 50);

  const result = await reconcileVapiCosts(sb, apiKey, {
    max,
    transcript_ids: transcriptIds,
  });

  res.status(result.ok ? 200 : 500).json(result);
}
