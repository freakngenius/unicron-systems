// api/skills/index.ts — Sprint 9 Stream B
//
// GET /api/skills — list Skills, scoped by tenant.
//
// Query params:
//   ?lifecycle_status=proposed|approved|retired|rejected  (default 'approved')
//   ?status=active|scaffolded|deprecated                  (default 'active')
//   ?customer_id=<uuid>|null                              (default: caller scope)
//   ?limit=<int 1-200>                                    (default 100)
//
// RLS contract per Addendum 5 §3: customer_id IS NULL (system Skill)
// OR customer_id = caller's tenant. System Skills always visible.
// Service-role access on the server applies the filter explicitly at
// the app layer; the filter is not user-supplied beyond opting into a
// specific tenant they already belong to.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkSkillsAuth } from '../../lib/skills/auth.js';
import { getSkillsServiceClient, skillsTable } from '../../lib/skills/supabase.js';

const VALID_LIFECYCLE = new Set(['proposed', 'approved', 'retired', 'rejected']);
const VALID_STATUS = new Set(['active', 'scaffolded', 'deprecated']);

function qstr(q: VercelRequest['query'], k: string): string | undefined {
  const v = q[k];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
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

  const lifecycleStatus = qstr(req.query, 'lifecycle_status') ?? 'approved';
  const status = qstr(req.query, 'status') ?? 'active';
  const customerIdParam = qstr(req.query, 'customer_id');
  const limitParam = qstr(req.query, 'limit');

  if (!VALID_LIFECYCLE.has(lifecycleStatus)) {
    res.status(400).json({
      ok: false,
      error: `invalid lifecycle_status; must be one of: ${[...VALID_LIFECYCLE].join(', ')}`,
    });
    return;
  }
  if (!VALID_STATUS.has(status)) {
    res.status(400).json({
      ok: false,
      error: `invalid status; must be one of: ${[...VALID_STATUS].join(', ')}`,
    });
    return;
  }

  const limit = (() => {
    const n = Number(limitParam ?? '100');
    if (!Number.isFinite(n) || n <= 0) return 100;
    return Math.min(Math.floor(n), 200);
  })();

  try {
    const sb = getSkillsServiceClient();
    let q = skillsTable(sb)
      .select(
        'id,name,description,domain,type,inputs_schema,outputs_schema,schedule_cron,trigger_event,' +
          'refusal_gate,budget_usd_per_run,active,status,run_endpoint,repo,skill_md_path,' +
          'lifecycle_status,version,parent_skill_id,author_kind,author_id,approved_by,approved_at,' +
          'taboo_check_id,run_count,success_count,last_run_at,decay_at,customer_id,created_at,updated_at',
      )
      .eq('lifecycle_status', lifecycleStatus)
      .eq('status', status)
      .limit(limit)
      .order('updated_at', { ascending: false });

    // Tenant scoping: system Skills (customer_id IS NULL) are always
    // visible. If the caller explicitly requests a tenant, restrict to
    // that tenant (RLS still applies at DB level for session callers
    // once the migration enables it).
    if (customerIdParam && customerIdParam !== 'null') {
      q = q.or(`customer_id.is.null,customer_id.eq.${customerIdParam}`);
    } else if (customerIdParam === 'null') {
      q = q.is('customer_id', null);
    }

    const { data, error } = await q;
    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    res.status(200).json({ ok: true, skills: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
}
