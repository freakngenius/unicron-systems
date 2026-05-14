// api/skills/[id].ts — Sprint 9 Stream B
//
// GET /api/skills/:id — fetch one Skill with version history walked via
// parent_skill_id (Addendum 5 §4). Walks iteratively up the lineage and
// also collects descendants (children pointing at this Skill via
// parent_skill_id) so the operator sees the full version graph.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkSkillsAuth } from '../../lib/skills/auth.js';
import { getSkillsServiceClient, skillsTable } from '../../lib/skills/supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const SELECT_COLS =
  'id,name,description,domain,type,inputs_schema,outputs_schema,schedule_cron,trigger_event,' +
  'refusal_gate,budget_usd_per_run,active,status,run_endpoint,repo,skill_md_path,' +
  'lifecycle_status,version,parent_skill_id,author_kind,author_id,approved_by,approved_at,' +
  'taboo_check_id,run_count,success_count,last_run_at,decay_at,customer_id,evidence,' +
  'created_at,updated_at';

const MAX_WALK_DEPTH = 50;

interface SkillRow {
  id: string;
  parent_skill_id: string | null;
  version: number;
  [k: string]: unknown;
}

async function walkParents(
  sb: SupabaseClient,
  start: SkillRow,
): Promise<SkillRow[]> {
  const chain: SkillRow[] = [];
  let current = start.parent_skill_id;
  let depth = 0;
  const seen = new Set<string>([start.id]);
  while (current && depth < MAX_WALK_DEPTH) {
    if (seen.has(current)) break;
    seen.add(current);
    const { data, error } = await skillsTable(sb)
      .select(SELECT_COLS)
      .eq('id', current)
      .maybeSingle();
    if (error || !data) break;
    const row = data as unknown as SkillRow;
    chain.push(row);
    current = row.parent_skill_id;
    depth += 1;
  }
  return chain;
}

async function fetchChildren(
  sb: SupabaseClient,
  id: string,
): Promise<SkillRow[]> {
  const { data, error } = await skillsTable(sb)
    .select(SELECT_COLS)
    .eq('parent_skill_id', id)
    .order('version', { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as SkillRow[];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-unicron-api-key');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
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

  try {
    const sb = getSkillsServiceClient();
    const { data, error } = await skillsTable(sb)
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ ok: false, error: 'skill not found' });
      return;
    }
    const skill = data as unknown as SkillRow;
    const [ancestors, descendants] = await Promise.all([
      walkParents(sb, skill),
      fetchChildren(sb, skill.id),
    ]);

    res.status(200).json({
      ok: true,
      skill,
      version_history: {
        ancestors, // oldest at end of array; ordered nearest-parent first
        descendants, // newer versions of this Skill, sorted by version asc
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
}
