// api/proposed-skills/index.ts — Sprint 9 Stream B
//
// GET /api/proposed-skills — queue for human reviewers (Addendum 5 §4).
//
// Query params:
//   ?status=queued|approved|rejected|expired (default 'queued')
//   ?customer_id=<uuid>|null                 (default: caller scope)
//   ?limit=<int 1-200>                       (default 100)
//
// Visibility per Addendum 5 §3:
//   - System proposals (customer_id IS NULL) → operator allowlist
//     (Kyle/Keenan/Curtis) only.
//   - Per-tenant proposals → customer admin of that tenant.
// Sprint 9 enforces this at the app layer: internal-key callers and any
// allowlisted session see all proposals; an explicit customer_id filter
// narrows the scope.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkSkillsAuth } from '../../lib/skills/auth.js';
import {
  getSkillsServiceClient,
  proposedSkillsTable,
} from '../../lib/skills/supabase.js';

const VALID_STATUS = new Set(['queued', 'approved', 'rejected', 'expired']);

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

  const status = qstr(req.query, 'status') ?? 'queued';
  if (!VALID_STATUS.has(status)) {
    res.status(400).json({
      ok: false,
      error: `invalid status; must be one of: ${[...VALID_STATUS].join(', ')}`,
    });
    return;
  }
  const customerIdParam = qstr(req.query, 'customer_id');
  const limitParam = qstr(req.query, 'limit');
  const limit = (() => {
    const n = Number(limitParam ?? '100');
    if (!Number.isFinite(n) || n <= 0) return 100;
    return Math.min(Math.floor(n), 200);
  })();

  try {
    const sb = getSkillsServiceClient();
    let q = proposedSkillsTable(sb)
      .select(
        'id,proposed_skill,customer_id,source_run_id,trajectory_summary,satisfaction_score,' +
          'confidence,taboo_check_id,taboo_flags,status,reviewed_by,reviewed_at,' +
          'rejection_reason,created_at,expires_at',
      )
      .eq('status', status)
      .limit(limit)
      .order('created_at', { ascending: false });

    if (customerIdParam === 'null') {
      q = q.is('customer_id', null);
    } else if (customerIdParam) {
      q = q.eq('customer_id', customerIdParam);
    }

    const { data, error } = await q;
    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }
    res.status(200).json({ ok: true, proposed_skills: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
}
