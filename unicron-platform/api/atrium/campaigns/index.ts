// GET  /api/atrium/campaigns — list all campaigns
// POST /api/atrium/campaigns — create a new campaign
//
// Sprint 6 Stream A.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Supabase service-role client (server-only) ────────────────────────────────

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key, { db: { schema: 'nervous_system' } });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const sb = getServiceClient();
      const { data, error } = await sb
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.status(200).json({ campaigns: data ?? [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body?.name || typeof body.name !== 'string') {
      res.status(400).json({ error: 'Missing required field: name' });
      return;
    }

    try {
      const sb = getServiceClient();
      const { data, error } = await sb
        .from('campaigns')
        .insert({
          name: body.name,
          status: body.status ?? 'draft',
          goal: body.goal ?? null,
          channels: body.channels ?? null,
          start_date: body.start_date ?? null,
          end_date: body.end_date ?? null,
          target_metric: body.target_metric ?? null,
          owner_team_member_id: body.owner_team_member_id ?? null,
          notes: body.notes ?? null,
          ttl_days: body.ttl_days ?? 90,
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ campaign: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
