// GET /api/voice/cron-attempts
//
// Recent voice_call_attempts joined with source name + config name. Powers the
// observability view of scheduled procurement pulls.
//
// Translated from prototype src/app/api/cron-attempts/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin.js';

const MOCK_CUSTOMERS = ['mock_voice_demo'];

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const limitRaw    = pickStr(req.query.limit);
  const status      = pickStr(req.query.status);
  const customer    = pickStr(req.query.customer_org_id);
  const excludeMock = pickStr(req.query.exclude_mock) !== '0';
  const limit = Math.min(Math.max(Number(limitRaw ?? 100), 1), 500);

  const sb = getPathfinderServiceClient();
  let q = sb
    .from('voice_call_attempts')
    .select(
      'id, source_id, agent_type, customer_org_id, config_id, target_office_key, to_phone, status, vapi_call_id, transcript_row_id, attempt_count, outcome, scheduled_for, claimed_at, completed_at, created_at, error_message',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status)     q = q.eq('status', status);
  if (customer)   q = q.eq('customer_org_id', customer);
  if (excludeMock) q = q.not('customer_org_id', 'in', `(${MOCK_CUSTOMERS.map((c) => `"${c}"`).join(',')})`);

  const { data, error } = await q;
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }

  type AttemptRow = {
    id: string; source_id: string | null; agent_type: string;
    customer_org_id: string | null; config_id: string | null;
    target_office_key: string | null; to_phone: string; status: string;
    vapi_call_id: string | null; transcript_row_id: string | null;
    attempt_count: number; outcome: string | null;
    scheduled_for: string; claimed_at: string | null; completed_at: string | null;
    created_at: string; error_message: string | null;
  };
  const rows = (data ?? []) as AttemptRow[];

  const sourceIds = Array.from(new Set(rows.map((a) => a.source_id).filter((x): x is string => Boolean(x))));
  const configIds = Array.from(new Set(rows.map((a) => a.config_id).filter((x): x is string => Boolean(x))));

  const sourcesById: Record<string, { id: string; source_name: string; agent_type: string; name: string }> = {};
  if (sourceIds.length) {
    const { data: srcs } = await sb
      .from('voice_agent_sources')
      .select('id, source_name, agent_type')
      .in('id', sourceIds);
    for (const s of (srcs ?? []) as Array<{ id: string; source_name: string; agent_type: string }>) {
      sourcesById[s.id] = { ...s, name: s.source_name };
    }
  }
  const configsById: Record<string, { id: string; config_name: string; customer_org_id: string; name: string }> = {};
  if (configIds.length) {
    const { data: cfgs } = await sb
      .from('procurement_pull_configs')
      .select('id, config_name, customer_org_id')
      .in('id', configIds);
    for (const c of (cfgs ?? []) as Array<{ id: string; config_name: string; customer_org_id: string }>) {
      configsById[c.id] = { ...c, name: c.config_name };
    }
  }

  const enriched = rows.map((a) => ({
    ...a,
    source: a.source_id ? sourcesById[a.source_id] ?? null : null,
    config: a.config_id ? configsById[a.config_id] ?? null : null,
  }));

  const counts: Record<string, number> = {};
  for (const a of enriched) counts[a.status] = (counts[a.status] ?? 0) + 1;

  res.status(200).json({ ok: true, attempts: enriched, counts });
}
