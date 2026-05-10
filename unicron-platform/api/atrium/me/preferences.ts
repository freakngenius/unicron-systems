// GET  /api/atrium/me/preferences  — read notification preferences for a team member
// PATCH /api/atrium/me/preferences — update notification preferences for a team member
//
// Uses ns_get_member_notifications / ns_update_member_notifications RPCs.
// nervous_system schema is NOT exposed in PostgREST (PGRST106).
// All DB access goes through public-schema SECURITY DEFINER RPCs.
// Sprint 7 Stream B.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ── GET: read current preferences ──────────────────────────────────────────
  if (req.method === 'GET') {
    const member_id = req.query['member_id'] as string | undefined;
    if (!member_id) {
      res.status(400).json({ error: 'member_id query param required' });
      return;
    }

    // Validate member_id looks like a UUID (prevent injection surface)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(member_id)) {
      res.status(400).json({ error: 'member_id must be a valid UUID' });
      return;
    }

    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_get_member_notifications', {
        p_member_id: member_id,
      });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ notifications: data ?? {} });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  // ── PATCH: update preferences ───────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as Record<string, unknown> | undefined;
    const member_id = body?.['member_id'];
    const notifications = body?.['notifications'];

    if (!member_id || typeof member_id !== 'string') {
      res.status(400).json({ error: 'member_id required' });
      return;
    }

    // Validate member_id looks like a UUID
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(member_id)) {
      res.status(400).json({ error: 'member_id must be a valid UUID' });
      return;
    }

    if (!notifications || typeof notifications !== 'object' || Array.isArray(notifications)) {
      res.status(400).json({ error: 'notifications must be an object' });
      return;
    }

    try {
      const sb = getServiceClient();
      const { error } = await sb.rpc('ns_update_member_notifications', {
        p_member_id: member_id,
        p_notifications: notifications,
      });
      if (error) {
        // Surface 'not found' as 404 so the UI can distinguish it
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
