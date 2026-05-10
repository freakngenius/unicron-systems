// GET  /api/atrium/scheduled-jobs — list all jobs via ns_list_scheduled_jobs
// POST /api/atrium/scheduled-jobs — toggle or trigger a job
// Sprint 7 Stream C — Task 5
//
// Verified scheduled_jobs schema:
//   id (uuid), name (text), schedule_cron (text), owner_agent_id (uuid),
//   active (boolean), last_run_at (timestamptz), last_run_status (text),
//   next_run_at (timestamptz), notes (text), created_at (timestamptz)

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // GET — list all scheduled jobs
  if (req.method === 'GET') {
    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_list_scheduled_jobs');
      if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
      res.status(200).json({ ok: true, jobs: data ?? [] });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // POST — toggle or trigger
  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown> | undefined;
    const op           = body?.['op'] as string | undefined;
    const id           = body?.['id']  as string | undefined;
    const triggered_by = (body?.['triggered_by'] as string | undefined) ?? 'operator';

    if (!op || !id) {
      res.status(400).json({ ok: false, error: 'Missing required fields: op, id' });
      return;
    }

    try {
      const sb = getServiceClient();

      if (op === 'toggle') {
        const active = body?.['active'] as boolean | undefined;
        if (active === undefined || typeof active !== 'boolean') {
          res.status(400).json({ ok: false, error: 'Missing required field: active (boolean)' });
          return;
        }
        const { data, error } = await sb.rpc('ns_toggle_scheduled_job', {
          p_id:           id,
          p_active:       active,
          p_triggered_by: triggered_by,
        });
        if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
        res.status(200).json({ ok: true, result: data });
        return;
      }

      if (op === 'trigger') {
        const { data, error } = await sb.rpc('ns_trigger_scheduled_job', {
          p_id:           id,
          p_triggered_by: triggered_by,
        });
        if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
        res.status(200).json({ ok: true, result: data });
        return;
      }

      res.status(400).json({ ok: false, error: `Unknown op: ${op}. Must be toggle or trigger` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
