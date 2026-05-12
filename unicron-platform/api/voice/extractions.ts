// GET /api/voice/extractions?transcript_id=...
//
// Lists customer_call_extractions for a given transcript, newest first.
// Used by the activity call-detail panel to render extracted facts.
//
// Translated from prototype src/app/api/extractions/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin.js';

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const transcriptId = pickStr(req.query.transcript_id);
  if (!transcriptId) {
    res.status(400).json({ ok: false, error: 'transcript_id required' });
    return;
  }

  const sb = getPathfinderServiceClient();
  const { data, error } = await sb
    .from('customer_call_extractions')
    .select('*')
    .eq('transcript_id', transcriptId)
    .order('extracted_at', { ascending: false })
    .limit(20);
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
  res.status(200).json({ ok: true, extractions: data ?? [] });
}
