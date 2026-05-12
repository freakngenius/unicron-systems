// /api/voice/sources/:id/allowlist
//
// GET    → { mode, phones[], hubspot_filter, open_mode_confirmed_at, open_mode_confirmed_by }
// POST   → add / remove / replace allowlist phones with normalize + dedupe
// PATCH  → switch allowlist_mode between 'allowlist' | 'hubspot' | 'open'
//          - hubspot: accepts hubspot_filter, clears open-mode metadata
//          - open: requires confirm_open=true, stamps confirmed_at/_by
//          - allowlist (default): clears hubspot_filter? NO — preserves on revert.
//            Open-mode metadata is cleared.
//
// Translated from prototype src/app/api/voice-sources/[id]/allowlist/route.ts.
// Atrium adds requireVoiceAccess (prototype used requireBuilderAuth which is a
// no-op in prod).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../../../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../../../_lib/supabaseAdmin.js';
import { normalizeE164 } from '../../../../src/lib/voice/allowlist.js';

function safeParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseRaw(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => normalizeE164(s))
    .filter((s) => s.length > 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
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
      .from('voice_agent_sources')
      .select('id, source_name, allowlist_mode, allowlist_phones, hubspot_filter, open_mode_confirmed_at, open_mode_confirmed_by')
      .eq('id', id)
      .maybeSingle();
    if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
    if (!data)  { res.status(404).json({ ok: false, error: 'not found' }); return; }
    const row = data as {
      id: string;
      source_name: string | null;
      allowlist_mode: string | null;
      allowlist_phones: string[] | null;
      hubspot_filter: Record<string, unknown> | null;
      open_mode_confirmed_at: string | null;
      open_mode_confirmed_by: string | null;
    };
    res.status(200).json({
      ok: true,
      id: row.id,
      source_name: row.source_name,
      mode: row.allowlist_mode ?? 'allowlist',
      phones: row.allowlist_phones ?? [],
      hubspot_filter: row.hubspot_filter ?? null,
      open_mode_confirmed_at: row.open_mode_confirmed_at ?? null,
      open_mode_confirmed_by: row.open_mode_confirmed_by ?? null,
    });
    return;
  }

  if (req.method === 'POST') {
    const body = (typeof req.body === 'string' ? safeParseJson(req.body) : req.body) as Record<string, unknown> | null;
    if (!body) { res.status(400).json({ ok: false, error: 'invalid body' }); return; }
    const action = String(body.action ?? '').toLowerCase();
    const explicit = Array.isArray(body.phones)
      ? (body.phones as unknown[]).map((p) => normalizeE164(String(p)))
      : [];
    const pasted = typeof body.raw === 'string' && (body.raw as string).trim()
      ? parseRaw(body.raw as string)
      : [];
    const incoming = Array.from(new Set([...explicit, ...pasted].filter(Boolean)));

    const { data: cur, error: curErr } = await sb
      .from('voice_agent_sources')
      .select('allowlist_phones')
      .eq('id', id)
      .maybeSingle();
    if (curErr) { res.status(500).json({ ok: false, error: curErr.message }); return; }
    if (!cur)   { res.status(404).json({ ok: false, error: 'not found' }); return; }

    const existing = (((cur as { allowlist_phones: string[] | null }).allowlist_phones) ?? [])
      .map((p) => normalizeE164(p));

    let next: string[];
    if (action === 'add') {
      next = Array.from(new Set([...existing, ...incoming]));
    } else if (action === 'remove') {
      const drop = new Set(incoming);
      next = existing.filter((p) => !drop.has(p));
    } else if (action === 'replace') {
      next = Array.from(new Set(incoming));
    } else {
      res.status(400).json({ ok: false, error: "action must be 'add', 'remove', or 'replace'" });
      return;
    }

    const { data, error } = await sb
      .from('voice_agent_sources')
      .update({ allowlist_phones: next, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, allowlist_phones')
      .single();
    if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
    const out = data as { id: string; allowlist_phones: string[] | null };
    res.status(200).json({
      ok: true,
      phones: out.allowlist_phones ?? [],
      count: (out.allowlist_phones ?? []).length,
      action,
      affected: incoming.length,
    });
    return;
  }

  // PATCH
  const body = (typeof req.body === 'string' ? safeParseJson(req.body) : req.body) as Record<string, unknown> | null;
  if (!body) { res.status(400).json({ ok: false, error: 'invalid body' }); return; }
  const mode = String(body.mode ?? '').toLowerCase();
  if (!['allowlist', 'hubspot', 'open'].includes(mode)) {
    res.status(400).json({ ok: false, error: "mode must be 'allowlist', 'hubspot', or 'open'" });
    return;
  }

  const updates: Record<string, unknown> = {
    allowlist_mode: mode,
    updated_at: new Date().toISOString(),
  };

  if (mode === 'hubspot') {
    updates.hubspot_filter = body.hubspot_filter ?? null;
    updates.open_mode_confirmed_at = null;
    updates.open_mode_confirmed_by = null;
  } else if (mode === 'open') {
    if (body.confirm_open !== true) {
      res.status(400).json({
        ok: false,
        error: "switching to 'open' mode requires confirm_open=true. Open mode disables the per-agent allowlist; only the env VOICE_ALLOWLIST (if set) is enforced.",
      });
      return;
    }
    updates.open_mode_confirmed_at = new Date().toISOString();
    updates.open_mode_confirmed_by = typeof body.confirmed_by === 'string' ? body.confirmed_by : auth.email;
  } else {
    updates.open_mode_confirmed_at = null;
    updates.open_mode_confirmed_by = null;
  }

  const { data, error } = await sb
    .from('voice_agent_sources')
    .update(updates)
    .eq('id', id)
    .select('id, allowlist_mode, hubspot_filter, open_mode_confirmed_at, open_mode_confirmed_by')
    .single();
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
  res.status(200).json({ ok: true, ...(data as Record<string, unknown>) });
}
