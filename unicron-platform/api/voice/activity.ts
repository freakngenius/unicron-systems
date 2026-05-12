// GET /api/voice/activity
//
// Unified activity feed across voice calls + voice-sourced projects + cron
// attempts. Powers the timeline view. Newest-first.
//
// Translated from prototype src/app/api/activity/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin';

const MOCK_CUSTOMERS = ['mock_voice_demo'];

type ActivityEvent = {
  id: string;
  type: 'call' | 'project' | 'cron_attempt';
  ts: string;
  title: string;
  subtitle: string;
  status?: string | null;
  customer_org_id?: string;
  ref?: { kind: string; id: string };
  meta?: Record<string, unknown>;
};

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const limit         = Math.min(Number(pickStr(req.query.limit) ?? 50), 200);
  const customerOrgId = pickStr(req.query.customer_org_id);
  const excludeMock   = pickStr(req.query.exclude_mock) === '1';
  const typesParam    = pickStr(req.query.types);
  const types = typesParam
    ? new Set(typesParam.split(',').map((s) => s.trim()))
    : new Set(['call', 'project', 'cron_attempt']);

  const sb = getPathfinderServiceClient();
  const events: ActivityEvent[] = [];

  // Voice calls
  if (types.has('call')) {
    let q = sb
      .from('voice_call_transcripts')
      .select('id, customer_org_id, to_phone, from_phone, contact_name, call_status, summary, outcome, duration_seconds, created_at, ended_at, cost_usd')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (customerOrgId) q = q.eq('customer_org_id', customerOrgId);
    if (excludeMock)   q = q.not('customer_org_id', 'in', `(${MOCK_CUSTOMERS.map((c) => `"${c}"`).join(',')})`);
    const { data } = await q;
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      events.push({
        id: `call:${r.id as string}`,
        type: 'call',
        ts: (r.ended_at as string) ?? (r.created_at as string),
        title: r.outcome ? `Call ${r.call_status as string} · ${r.outcome as string}` : `Call ${r.call_status as string}`,
        subtitle:
          ((r.contact_name as string) ?? (r.to_phone as string)) +
          (r.summary ? ` — ${String(r.summary).slice(0, 140)}` : ''),
        status: r.call_status as string,
        customer_org_id: r.customer_org_id as string,
        ref: { kind: 'voice_call_transcript', id: r.id as string },
        meta: { duration_seconds: r.duration_seconds, cost_usd: r.cost_usd ?? null },
      });
    }
  }

  // Voice-sourced projects
  if (types.has('project')) {
    let q = sb
      .from('projects')
      .select('id, source, source_id, warm_for_customer_id, title, project_value, project_stage, owner_name, location_text, posted_date, ingested_at, raw_payload')
      .eq('source', 'voice_agent')
      .order('ingested_at', { ascending: false })
      .limit(limit);
    if (customerOrgId) q = q.eq('warm_for_customer_id', customerOrgId);
    if (excludeMock)   q = q.not('warm_for_customer_id', 'in', `(${MOCK_CUSTOMERS.map((c) => `"${c}"`).join(',')})`);
    const { data } = await q;
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const value = r.project_value
        ? `$${Number(r.project_value).toLocaleString()}`
        : 'value tbd';
      events.push({
        id: `project:${r.id as string}`,
        type: 'project',
        ts: (r.ingested_at as string) ?? (r.posted_date as string),
        title: `Lead captured · ${value}`,
        subtitle: [r.owner_name, r.project_stage, r.location_text].filter(Boolean).join(' · '),
        status: r.project_stage as string,
        customer_org_id: r.warm_for_customer_id as string,
        ref: { kind: 'project', id: r.id as string },
        meta: { vapi_call_id: (r.raw_payload as { vapi_call_id?: string } | null)?.vapi_call_id },
      });
    }
  }

  // Cron attempts
  if (types.has('cron_attempt')) {
    let q = sb
      .from('voice_call_attempts')
      .select('id, customer_org_id, target_office_key, agent_type, status, error_message, scheduled_for, claimed_at, vapi_call_id, transcript_row_id')
      .order('scheduled_for', { ascending: false })
      .limit(limit);
    if (customerOrgId) q = q.eq('customer_org_id', customerOrgId);
    if (excludeMock)   q = q.not('customer_org_id', 'in', `(${MOCK_CUSTOMERS.map((c) => `"${c}"`).join(',')})`);
    const { data } = await q;
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      events.push({
        id: `attempt:${r.id as string}`,
        type: 'cron_attempt',
        ts: (r.scheduled_for as string) ?? (r.claimed_at as string),
        title: `Cron · ${r.agent_type as string} · ${r.status as string}`,
        subtitle: `${(r.target_office_key as string) ?? 'unknown'}${
          r.error_message ? ` — ${String(r.error_message).slice(0, 120)}` : ''
        }`,
        status: r.status as string,
        customer_org_id: r.customer_org_id as string,
        ref: r.transcript_row_id
          ? { kind: 'voice_call_transcript', id: r.transcript_row_id as string }
          : { kind: 'voice_call_attempt', id: r.id as string },
      });
    }
  }

  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  res.status(200).json({ ok: true, events: events.slice(0, limit) });
}
