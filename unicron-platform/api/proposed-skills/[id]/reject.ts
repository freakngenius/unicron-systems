// api/proposed-skills/[id]/reject.ts — Sprint 9 Stream B
//
// POST /api/proposed-skills/:id/reject — mark a proposal rejected with
// reason. No skills row is created. No Taboo Keeper call needed because
// no write to nervous_system.skills occurs.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSkillsAuth } from '../../../lib/skills/auth.js';
import { getSkillsServiceClient, proposedSkillsTable } from '../../../lib/skills/supabase.js';

interface RejectBody {
  rejection_reason?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-unicron-api-key');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const auth = await checkSkillsAuth(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({ ok: false, error: 'id is required' });
    return;
  }

  const body = (req.body ?? {}) as RejectBody;
  const reason = typeof body.rejection_reason === 'string' ? body.rejection_reason.trim() : '';
  if (reason.length === 0) {
    res.status(400).json({ ok: false, error: 'rejection_reason is required' });
    return;
  }

  let sb: SupabaseClient;
  try {
    sb = getSkillsServiceClient();
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const { data: current, error: fetchErr } = await proposedSkillsTable(sb)
    .select('id,status')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) {
    res.status(500).json({ ok: false, error: fetchErr.message });
    return;
  }
  if (!current) {
    res.status(404).json({ ok: false, error: 'proposed skill not found' });
    return;
  }
  const currentStatus = (current as { status: string }).status;
  if (currentStatus !== 'queued') {
    res.status(409).json({
      ok: false,
      error: `proposal cannot be rejected: status=${currentStatus}`,
    });
    return;
  }

  const { data: updated, error: updateErr } = await proposedSkillsTable(sb)
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id,status,rejection_reason,reviewed_at')
    .single();

  if (updateErr) {
    res.status(500).json({ ok: false, error: updateErr.message });
    return;
  }

  res.status(200).json({ ok: true, proposed_skill: updated });
}
