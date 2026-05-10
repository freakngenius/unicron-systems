// GET  /api/atrium/audit-log — paginated, filterable audit log via ns_list_audit_log RPC
// Sprint 7 Stream C — Task 3
//
// Verified audit_log schema:
//   id (uuid), table_name (text), action (text), actor_id (uuid),
//   payload (jsonb), created_at (timestamptz)
//
// All DB access via SECURITY DEFINER RPC — nervous_system schema not PostgREST-exposed.

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    actor_id,
    table_name,
    action,
    since,
    until,
    limit: limitRaw,
    offset: offsetRaw,
  } = req.query as Record<string, string | undefined>;

  const p_limit  = Math.min(parseInt(limitRaw  ?? '100', 10) || 100, 500);
  const p_offset = parseInt(offsetRaw ?? '0', 10) || 0;

  try {
    const sb = getServiceClient();
    const { data, error } = await sb.rpc('ns_list_audit_log', {
      p_actor_id:   actor_id   ?? null,
      p_table_name: table_name ?? null,
      p_action:     action     ?? null,
      p_since:      since      ?? null,
      p_until:      until      ?? null,
      p_limit,
      p_offset,
    });

    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    res.status(200).json({ ok: true, rows: data ?? [], count: (data ?? []).length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
}
