// GET /api/voice/transcripts
//
// Lists voice_call_transcripts (newest first) with optional filtering by
// customer_org_id and source_id. Excludes mock customers by default.
//
// Translated from prototype src/app/api/transcripts/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin.js';

const MOCK_CUSTOMERS = ['mock_voice_demo'];

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const customerOrgId = pickStr(req.query.customer_org_id);
  const sourceId      = pickStr(req.query.source_id);
  const limitRaw      = pickStr(req.query.limit);
  const excludeMock   = pickStr(req.query.exclude_mock) !== '0';
  const limit = Math.min(parseInt(limitRaw ?? '50', 10) || 50, 200);

  const sb = getPathfinderServiceClient();
  let q = sb
    .from('voice_call_transcripts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (customerOrgId) q = q.eq('customer_org_id', customerOrgId);
  if (sourceId)      q = q.eq('source_id', sourceId);
  if (excludeMock)   q = q.not('customer_org_id', 'in', `(${MOCK_CUSTOMERS.map((c) => `"${c}"`).join(',')})`);

  const { data, error } = await q;
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
  res.status(200).json({ ok: true, transcripts: data ?? [] });
}
