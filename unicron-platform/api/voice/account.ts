// GET /api/voice/account
//
// Returns aggregated Vapi spend rollup for the Voice Account view:
//   - vapi_org_id (most recent transcript with one)
//   - lifetime { calls, cost_usd, minutes }
//   - totals { d7, d30, d90 } each with { calls, cost_usd }
//   - by_agent [{ source_id, source_name, agent_type, status, calls, cost_usd }]
//   - by_day   [{ day, calls, cost_usd }] for last 30 days
//   - top_calls [{ transcript_id, source_id, source_name, to_phone, contact_name, cost_usd, duration_seconds, created_at }]
//
// Translated from prototype src/app/api/vapi/account/route.ts. Atrium adds
// requireVoiceAccess at the top (prototype was intentionally public; spec §4
// requires bearer-JWT on every /api/voice/* route — Kyle confirmed 2026-05-12).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin.js';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

type TranscriptRow = {
  id: string;
  source_id: string | null;
  customer_org_id: string | null;
  cost_usd: number | string | null;
  duration_seconds: number | null;
  created_at: string;
  call_status: string | null;
  ended_reason: string | null;
  to_phone: string | null;
  contact_name: string | null;
  summary: string | null;
  ended_at: string | null;
  started_at: string | null;
  vapi_org_id: string | null;
};

type SourceRow = {
  id: string;
  source_name: string | null;
  agent_type: string | null;
  status: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const sb = getPathfinderServiceClient();
  const since90 = isoDaysAgo(90);

  const { data: windowRows, error: e1 } = await sb
    .from('voice_call_transcripts')
    .select('id, source_id, customer_org_id, cost_usd, duration_seconds, created_at, call_status, ended_reason, to_phone, contact_name, summary, ended_at, started_at, vapi_org_id')
    .gte('created_at', since90)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (e1) { res.status(500).json({ ok: false, error: e1.message }); return; }

  const { data: lifetimeRows, error: e2 } = await sb
    .from('voice_call_transcripts')
    .select('cost_usd, duration_seconds')
    .order('created_at', { ascending: false })
    .limit(50000);
  if (e2) { res.status(500).json({ ok: false, error: e2.message }); return; }

  const { data: sources, error: e3 } = await sb
    .from('voice_agent_sources')
    .select('id, source_name, agent_type, status');
  if (e3) { res.status(500).json({ ok: false, error: e3.message }); return; }

  const rows = (windowRows ?? []) as TranscriptRow[];
  const lifetime = (lifetimeRows ?? []) as Array<Pick<TranscriptRow, 'cost_usd' | 'duration_seconds'>>;
  const sourceById = new Map<string, SourceRow>(
    ((sources ?? []) as SourceRow[]).map((s) => [s.id, s])
  );

  const orgRow = rows.find((r) => r.vapi_org_id);

  const now = Date.now();
  const cutoff7  = now - 7  * 24 * 3600 * 1000;
  const cutoff30 = now - 30 * 24 * 3600 * 1000;
  const cutoff90 = now - 90 * 24 * 3600 * 1000;

  let s7 = 0, s30 = 0, s90 = 0;
  let c7 = 0, c30 = 0, c90 = 0;
  const byAgent = new Map<string, { calls: number; cost: number }>();
  const byDay = new Map<string, { calls: number; cost: number }>();

  for (const r of rows) {
    const created = new Date(r.created_at).getTime();
    const cost = Number(r.cost_usd ?? 0) || 0;
    if (created >= cutoff7)  { s7  += cost; c7++;  }
    if (created >= cutoff30) { s30 += cost; c30++; }
    if (created >= cutoff90) { s90 += cost; c90++; }

    const sid = r.source_id ?? 'unknown';
    const a = byAgent.get(sid) ?? { calls: 0, cost: 0 };
    a.calls += 1;
    a.cost  += cost;
    byAgent.set(sid, a);

    const dayKey = new Date(r.created_at).toISOString().slice(0, 10);
    const d = byDay.get(dayKey) ?? { calls: 0, cost: 0 };
    d.calls += 1;
    d.cost  += cost;
    byDay.set(dayKey, d);
  }

  let lifetimeSpend   = 0;
  let lifetimeCalls   = 0;
  let lifetimeMinutes = 0;
  for (const r of lifetime) {
    lifetimeSpend   += Number(r.cost_usd ?? 0) || 0;
    lifetimeCalls   += 1;
    lifetimeMinutes += Number(r.duration_seconds ?? 0) / 60;
  }

  const byAgentSorted = Array.from(byAgent.entries())
    .map(([sid, a]) => {
      const s = sourceById.get(sid);
      return {
        source_id: sid,
        source_name: s?.source_name ?? 'Unknown',
        agent_type: s?.agent_type ?? null,
        status: s?.status ?? null,
        calls: a.calls,
        cost_usd: Number(a.cost.toFixed(4)),
      };
    })
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const byDaySorted = Array.from(byDay.entries())
    .map(([day, d]) => ({ day, calls: d.calls, cost_usd: Number(d.cost.toFixed(4)) }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  const topCalls = rows
    .filter((r) => Number(r.cost_usd ?? 0) > 0)
    .sort((a, b) => Number(b.cost_usd ?? 0) - Number(a.cost_usd ?? 0))
    .slice(0, 10)
    .map((r) => ({
      transcript_id: r.id,
      source_id: r.source_id,
      source_name: r.source_id ? (sourceById.get(r.source_id)?.source_name ?? 'Unknown') : 'Unknown',
      to_phone: r.to_phone,
      contact_name: r.contact_name,
      cost_usd: Number(r.cost_usd ?? 0),
      duration_seconds: r.duration_seconds ?? 0,
      created_at: r.created_at,
    }));

  res.status(200).json({
    ok: true,
    vapi_org_id: orgRow?.vapi_org_id ?? null,
    lifetime: {
      calls: lifetimeCalls,
      cost_usd: Number(lifetimeSpend.toFixed(4)),
      minutes: Number(lifetimeMinutes.toFixed(1)),
    },
    totals: {
      d7:  { calls: c7,  cost_usd: Number(s7.toFixed(4))  },
      d30: { calls: c30, cost_usd: Number(s30.toFixed(4)) },
      d90: { calls: c90, cost_usd: Number(s90.toFixed(4)) },
    },
    by_agent: byAgentSorted,
    by_day: byDaySorted,
    top_calls: topCalls,
  });
}
