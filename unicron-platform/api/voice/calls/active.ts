// GET /api/voice/calls/active
//
// Calls currently in progress (queued/dialing/in-progress/ringing/forwarding).
// Used by the live observer panel.
//
// Translated from prototype src/app/api/calls/active/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../../_lib/voiceAuth';
import { getPathfinderServiceClient } from '../../_lib/supabaseAdmin';

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

  const excludeMock = pickStr(req.query.exclude_mock) !== '0';

  const sb = getPathfinderServiceClient();
  let q = sb
    .from('voice_call_transcripts')
    .select('id, source_id, customer_org_id, vapi_call_id, to_phone, contact_name, call_status, transcript, created_at, summary')
    .in('call_status', ['queued', 'dialing', 'in-progress', 'ringing', 'forwarding'])
    .order('created_at', { ascending: false })
    .limit(20);
  if (excludeMock) q = q.not('customer_org_id', 'in', `(${MOCK_CUSTOMERS.map((c) => `"${c}"`).join(',')})`);
  const { data, error } = await q;

  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
  type Turn = { role?: string; text?: string; ts?: string };
  res.status(200).json({
    ok: true,
    active: (data ?? []).map((r) => {
      const transcript = (r as { transcript: Turn[] | unknown }).transcript;
      const turns = Array.isArray(transcript) ? (transcript as Turn[]) : [];
      return {
        ...r,
        turn_count: turns.length,
        last_turn: turns.length > 0 ? turns[turns.length - 1] : null,
      };
    }),
  });
}
