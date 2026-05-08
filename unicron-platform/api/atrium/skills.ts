// api/atrium/skills.ts — Sprint 3 Stream E
// GET /api/atrium/skills — returns active skills from nervous_system.skills via RPC.
//
// Uses ns_list_skills() SECURITY DEFINER RPC because nervous_system schema is
// not exposed via standard PostgREST routing (consistent with orchestrator
// team_member lookup pattern — see fix #204).
//
// Environment:
//   VITE_SUPABASE_URL        — public Supabase project URL (shared with browser)
//   SUPABASE_SERVICE_ROLE_KEY — server-side only, never sent to browser

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

interface SkillRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  type: string;
  inputs: unknown[];
  outputs: unknown[];
  schedule_cron: string | null;
  refusal_gate: boolean;
  budget_usd_per_run: number | null;
  active: boolean;
  skill_path: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ ok: false, error: 'Supabase env vars not configured' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase.rpc('ns_list_skills');

  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }

  res.status(200).json(data as SkillRow[]);
}
