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

// Atrium audit fix item #22 — hide scaffolded skill slugs from the Skills
// list until they ship real runners. These slugs are the ones that
// /api/atrium/skills/run returns 202 'coming in future sprint' for. Keep this
// list in sync with SCAFFOLDED_SLUGS in api/atrium/skills/run.ts (we don't
// import from there because that file is a Vercel handler with side-effects).
const HIDDEN_SCAFFOLDED_SLUGS = new Set([
  'light-rag-query',
  'morning-trend-scan',
  'competitor-watch',
  'schedule-discovery-call',
  'extract-vertical-signals',
  'draft-follow-up-email',
  'generate-proposal',
]);

interface SkillRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  type: string;
  inputs_schema: unknown[];
  outputs_schema: unknown[];
  schedule_cron: string | null;
  refusal_gate: boolean;
  budget_usd_per_run: number | null;
  active: boolean;
  skill_md_path: string | null;
  status: string | null;
  run_endpoint: string | null;
  last_run_at: string | null;
  total_runs: number | null;
  execution: 'api' | 'agentic' | 'ui_trigger' | 'scheduled' | null;
  // ns_list_skills returns a `slug` column we filter on. Declared as optional
  // because older RPC versions did not include it.
  slug?: string | null;
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

  // Atrium audit fix item #22 — hide scaffolded slugs server-side so every
  // Atrium UI surface (Skills list in Now tab, CmdK palette, future surfaces)
  // stops advertising skills the runner immediately 202s on. ?show_hidden=1
  // is an escape hatch for debugging.
  const showHidden = req.query['show_hidden'] === '1';
  const rows = (data as SkillRow[] | null) ?? [];
  const filtered = showHidden
    ? rows
    : rows.filter((s) => !s.slug || !HIDDEN_SCAFFOLDED_SLUGS.has(s.slug));

  res.status(200).json(filtered);
}
