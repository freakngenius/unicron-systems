// /api/voice/procurement-configs
//   GET     list all configs (newest first)
//   POST    create new config
//   PATCH   update config by id (id in body)
//   DELETE  delete config by ?id=...
//
// Prototype used requireBuilderAuth (a no-op). Atrium gates everything via
// requireVoiceAccess (Bearer JWT + metacron.operator_allowlist).
//
// Translated from prototype src/app/api/procurement-configs/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin';

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
function safeParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const sb = getPathfinderServiceClient();

  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('procurement_pull_configs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
    res.status(200).json({ ok: true, configs: data ?? [] });
    return;
  }

  if (req.method === 'POST') {
    const body = (typeof req.body === 'string' ? safeParseJson(req.body) : req.body) as
      | Record<string, unknown> | null;
    if (!body) { res.status(400).json({ ok: false, error: 'invalid body' }); return; }
    const { data, error } = await sb
      .from('procurement_pull_configs')
      .insert(body)
      .select('*')
      .single();
    if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
    res.status(200).json({ ok: true, config: data });
    return;
  }

  if (req.method === 'PATCH') {
    const body = (typeof req.body === 'string' ? safeParseJson(req.body) : req.body) as
      | Record<string, unknown> | null;
    if (!body || typeof body.id !== 'string') {
      res.status(400).json({ ok: false, error: 'id required' });
      return;
    }
    const { id, ...rest } = body;
    const { data, error } = await sb
      .from('procurement_pull_configs')
      .update(rest)
      .eq('id', id)
      .select('*')
      .single();
    if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
    res.status(200).json({ ok: true, config: data });
    return;
  }

  if (req.method === 'DELETE') {
    const id = pickStr(req.query.id);
    if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }
    const { error } = await sb
      .from('procurement_pull_configs')
      .delete()
      .eq('id', id);
    if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
