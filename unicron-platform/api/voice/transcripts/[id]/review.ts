// POST /api/voice/transcripts/:id/review
//
// Operator review action: set operator_review_status (+ optional notes,
// reviewer email). Validated with zod (already in voice lib bundle).
//
// Translated from prototype src/app/api/transcripts/[id]/review/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireVoiceAccess, denyResponse } from '../../../_lib/voiceAuth';
import { getPathfinderServiceClient } from '../../../_lib/supabaseAdmin';

const Body = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'needs_followup']),
  notes: z.string().optional(),
  reviewer_email: z.string().email().optional(),
});

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const id = pickStr(req.query.id);
  if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }

  const raw = typeof req.body === 'string' ? safeParseJson(req.body) : req.body;
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(raw);
  } catch (e) {
    const err = e as z.ZodError;
    res.status(400).json({ ok: false, error: 'bad body', details: err.errors });
    return;
  }

  const reviewer = parsed.reviewer_email ?? auth.email;

  const sb = getPathfinderServiceClient();
  const { error } = await sb
    .from('voice_call_transcripts')
    .update({
      operator_review_status: parsed.status,
      operator_notes:         parsed.notes ?? null,
      reviewed_by_user_email: reviewer,
      reviewed_at:            new Date().toISOString(),
    })
    .eq('id', id);
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
  res.status(200).json({ ok: true });
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
