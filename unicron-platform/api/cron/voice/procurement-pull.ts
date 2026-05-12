// GET/POST /api/cron/voice/procurement-pull
//
// Hourly cron. Walks procurement_pull_configs.target_offices, evaluates each
// office's cron_expression against "now" (UTC), claims a voice_call_attempts
// row (idempotency key: (config_id, target_office_key, scheduled_for)), then
// dispatches a procurement-pull call to any office that is due.
//
// Auth: bypasses requireVoiceAccess. Instead:
//   - Accepts requests with `x-vercel-cron: 1` header (Vercel cron pings).
//   - Or `Authorization: Bearer $CRON_SECRET` (manual triggers / scripts).
//   - In dev/preview (VERCEL_ENV != "production") with no CRON_SECRET set,
//     allows unauthenticated calls for local testing.
//
// Translated from prototype src/app/api/cron/procurement-pull/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPathfinderServiceClient } from '../../_lib/supabaseAdmin';

type TargetOffice = {
  key: string;
  office_name: string;
  office_type?: string;
  phone: string;
  address?: string;
  pull_window_days?: number;
  cron_expression: string;
  why_priority?: string;
  enabled?: boolean;
  last_pull_notes?: string;
};
type ProcurementPullConfig = {
  id: string;
  customer_org_id: string;
  config_name: string;
  voice_agent_source_id: string;
  vapi_assistant_id: string | null;
  caller_brand: string;
  disclosure_text: string;
  agent_name: string;
  voice_id: string;
  pull_objective?: string;
  qualifying_questions?: unknown;
  target_offices: TargetOffice[];
  enabled?: boolean;
};

function fieldMatch(expr: string, value: number, min: number): boolean {
  if (expr === '*') return true;
  for (const part of expr.split(',')) {
    if (part.startsWith('*/')) {
      const step = Number(part.slice(2));
      if (step > 0 && (value - min) % step === 0) return true;
      continue;
    }
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      if (value >= a && value <= b) return true;
      continue;
    }
    const n = Number(part);
    if (!Number.isNaN(n) && n === value) return true;
  }
  return false;
}
function cronDueUtc(expression: string, when: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  return (
    fieldMatch(m,   when.getUTCMinutes(),     0) &&
    fieldMatch(h,   when.getUTCHours(),       0) &&
    fieldMatch(dom, when.getUTCDate(),        1) &&
    fieldMatch(mon, when.getUTCMonth() + 1,   1) &&
    fieldMatch(dow, when.getUTCDay(),         0)
  );
}

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
function pickHostHeader(req: VercelRequest): string {
  const h = req.headers.host;
  if (Array.isArray(h)) return h[0];
  return h ?? 'localhost';
}
function pickProto(req: VercelRequest): string {
  const v = req.headers['x-forwarded-proto'];
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? 'https').split(',')[0].trim();
}

function authorized(req: VercelRequest): boolean {
  if (pickStr(req.headers['x-vercel-cron'] as string | string[] | undefined)) return true;
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return process.env.VERCEL_ENV !== 'production';
  }
  const auth = pickStr(req.headers.authorization as string | string[] | undefined);
  if (auth === `Bearer ${expected}`) return true;
  return pickStr(req.headers['x-cron-secret'] as string | string[] | undefined) === expected;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const now = new Date();
  const scheduledFor = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    now.getUTCHours(), 0, 0, 0,
  )).toISOString();

  const sb = getPathfinderServiceClient();
  const { data: configs, error } = await sb
    .from('procurement_pull_configs')
    .select('*')
    .eq('is_active', true);
  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }

  const dispatched: Array<Record<string, unknown>> = [];
  const skipped:    Array<Record<string, unknown>> = [];
  const failed:     Array<Record<string, unknown>> = [];

  for (const cfgRow of (configs ?? []) as ProcurementPullConfig[]) {
    const offices = Array.isArray(cfgRow.target_offices) ? cfgRow.target_offices : [];
    for (const office of offices) {
      if (office.enabled === false) {
        skipped.push({ config: cfgRow.id, office: office.key, reason: 'office disabled' });
        continue;
      }
      if (!office.cron_expression || !cronDueUtc(office.cron_expression, now)) {
        skipped.push({ config: cfgRow.id, office: office.key, reason: 'not due' });
        continue;
      }

      const { data: claim, error: claimErr } = await sb
        .from('voice_call_attempts')
        .insert({
          source_id: cfgRow.voice_agent_source_id,
          agent_type: 'procurement_pull',
          config_id: cfgRow.id,
          target_office_key: office.key,
          to_phone: office.phone,
          scheduled_for: scheduledFor,
          status: 'claimed',
          customer_org_id: cfgRow.customer_org_id,
          claimed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (claimErr) {
        const code = (claimErr as { code?: string }).code;
        if (code === '23505') {
          skipped.push({ config: cfgRow.id, office: office.key, reason: 'already claimed' });
          continue;
        }
        failed.push({ config: cfgRow.id, office: office.key, error: claimErr.message });
        continue;
      }

      const dispatchUrl = `${pickProto(req)}://${pickHostHeader(req)}/api/voice/dispatch`;
      const body = {
        source_id: cfgRow.voice_agent_source_id,
        to_phone: office.phone,
        contact_name: `${office.office_name} clerk`,
        target_office_key: office.key,
        procurement_pull_config_id: cfgRow.id,
        variables: {
          caller_brand: cfgRow.caller_brand,
          office_name: office.office_name,
          office_type: office.office_type ?? 'procurement office',
          pull_objective: cfgRow.pull_objective ?? 'open and recently posted procurement records',
          disclosure_text: cfgRow.disclosure_text,
          agent_name: cfgRow.agent_name,
          pull_window_days: String(office.pull_window_days ?? 30),
          last_pull_notes: office.last_pull_notes ?? 'no prior pulls',
        },
      };

      try {
        const cronSecret = process.env.CRON_SECRET ?? '';
        // /api/voice/dispatch requires a Bearer JWT (requireVoiceAccess). Cron
        // cannot supply that, so foundation merge falls back: if INTERNAL_CRON_TOKEN
        // is set, send it as Authorization; otherwise the dispatch route will 401
        // and the attempt row is marked failed. Production cron will need either:
        //   (a) a follow-up that lets requireVoiceAccess accept CRON_SECRET, or
        //   (b) inlining the dispatch logic into this handler.
        // Documented in PR.
        const dispatchHeaders: Record<string, string> = { 'content-type': 'application/json' };
        if (process.env.INTERNAL_VOICE_DISPATCH_TOKEN) {
          dispatchHeaders.authorization = `Bearer ${process.env.INTERNAL_VOICE_DISPATCH_TOKEN}`;
        }
        if (cronSecret) {
          dispatchHeaders['x-cron-secret'] = cronSecret;
        }
        const r = await fetch(dispatchUrl, {
          method: 'POST',
          headers: dispatchHeaders,
          body: JSON.stringify(body),
        });
        const json = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; vapi_call_id?: string; transcript_row_id?: string };
        if (!r.ok || !json.ok) {
          await sb
            .from('voice_call_attempts')
            .update({
              status: 'failed',
              error_message: `dispatch ${r.status}: ${JSON.stringify(json).slice(0, 400)}`,
            })
            .eq('id', (claim as { id: string }).id);
          failed.push({ config: cfgRow.id, office: office.key, error: json.error ?? `http ${r.status}` });
          continue;
        }
        await sb
          .from('voice_call_attempts')
          .update({
            status: 'dispatched',
            vapi_call_id: json.vapi_call_id ?? null,
            transcript_row_id: json.transcript_row_id ?? null,
          })
          .eq('id', (claim as { id: string }).id);
        dispatched.push({
          config: cfgRow.id,
          office: office.key,
          vapi_call_id: json.vapi_call_id,
          transcript_row_id: json.transcript_row_id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await sb
          .from('voice_call_attempts')
          .update({ status: 'failed', error_message: msg })
          .eq('id', (claim as { id: string }).id);
        failed.push({ config: cfgRow.id, office: office.key, error: msg });
      }
    }
  }

  res.status(200).json({
    ok: true,
    scheduled_for: scheduledFor,
    dispatched_count: dispatched.length,
    skipped_count: skipped.length,
    failed_count: failed.length,
    dispatched,
    skipped: skipped.slice(0, 20),
    failed,
  });
}
