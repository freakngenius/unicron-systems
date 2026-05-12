// GET   /api/voice/transcripts/:id   single transcript lookup (used by live observer poll)
// PATCH /api/voice/transcripts/:id   operator review fields
//
// Translated from prototype src/app/api/transcripts/[id]/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../../_lib/supabaseAdmin.js';

const ALLOWED_PATCH_FIELDS = [
  'operator_review_status',
  'operator_notes',
  'reviewed_by_user_email',
  'reviewed_at',
  'outcome',
  'success_score',
] as const;

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const id = pickStr(req.query.id);
  if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }

  const sb = getPathfinderServiceClient();

  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('voice_call_transcripts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
    if (!data)  { res.status(404).json({ ok: false, error: 'not found' }); return; }
    res.status(200).json({ ok: true, transcript: data });
    return;
  }

  // PATCH
  const body = (typeof req.body === 'string' ? safeParseJson(req.body) : req.body) as
    | Record<string, unknown>
    | null;
  if (!body) { res.status(400).json({ ok: false, error: 'invalid body' }); return; }

  const update: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH_FIELDS) {
    if (k in body) update[k] = (body as Record<string, unknown>)[k];
  }
  if (body.operator_review_status === 'reviewed' && !update.reviewed_at) {
    update.reviewed_at = new Date().toISOString();
  }

  const { data, error } = await sb
    .from('voice_call_transcripts')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
  res.status(200).json({ ok: true, transcript: data });
}

function safeParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}
