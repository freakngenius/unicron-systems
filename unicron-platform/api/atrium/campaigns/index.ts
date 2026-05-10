// GET  /api/atrium/campaigns — list all campaigns
// POST /api/atrium/campaigns — create a new campaign
//
// Uses ns_list_campaigns() and ns_create_campaign() RPCs (public schema,
// SECURITY DEFINER) to avoid needing nervous_system in PostgREST exposed schemas.
// Sprint 6 Stream A.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

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

  if (req.method === 'GET') {
    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_list_campaigns');
      if (error) throw error;
      res.status(200).json({ campaigns: data ?? [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body?.name || typeof body.name !== 'string') {
      res.status(400).json({ error: 'Missing required field: name' });
      return;
    }

    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_create_campaign', {
        p_name: body.name,
        p_status: body.status ?? 'draft',
        p_goal: body.goal ?? null,
        p_channels: body.channels ?? null,
        p_start_date: body.start_date ?? null,
        p_end_date: body.end_date ?? null,
        p_target_metric: body.target_metric ?? null,
        p_owner_team_member_id: body.owner_team_member_id ?? null,
        p_notes: body.notes ?? null,
        p_ttl_days: body.ttl_days ?? 90,
      });
      if (error) throw error;
      const campaign = Array.isArray(data) ? data[0] : data;
      res.status(201).json({ campaign });
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
