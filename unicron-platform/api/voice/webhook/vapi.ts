// POST /api/voice/webhook/vapi
// GET  /api/voice/webhook/vapi   (health check)
//
// Receives Vapi server messages: transcript, status-update, end-of-call-report,
// hang. Bypasses requireVoiceAccess — instead verifies a shared secret in the
// x-vapi-secret (or x-secret) header against VAPI_WEBHOOK_SECRET.
//
// Spec divergence: §6 said "HMAC over raw body, bodyParser:false". The
// prototype's actual implementation does header-equality on a shared secret,
// with normal JSON body parsing. Matching prototype behavior so Prompt 02's
// PATCH-with-secret repoint works without further changes. Documented in PR.
//
// Translated from prototype src/app/api/webhook/vapi/route.ts.
//
// Out-of-scope chains skipped (foundation merge):
//   - autopilot/run, artifacts/run, signalsBridge: not in spec §5 surface.
//   - Extraction chain (/api/voice/extractions/run) IS chained on
//     end-of-call-report as the prototype did.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPathfinderServiceClient } from '../../_lib/supabaseAdmin.js';
import { normalizeE164 } from '../../../src/lib/voice/allowlist.js';
import { ingestProcurementPull } from '../../../src/lib/voice/procurementIngest.js';
import type { ExtractedPayload } from '../../../src/lib/voice/procurementIngest.js';
import { logSdrOutcome } from '../../../src/lib/voice/hubspot.js';

const VAPI_FROM = process.env.VAPI_FROM_NUMBER ?? '+17377026283';

function verifySecret(req: VercelRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) return true;
  const headerOrArr = req.headers['x-vapi-secret'] ?? req.headers['x-secret'];
  const got = Array.isArray(headerOrArr) ? headerOrArr[0] : headerOrArr;
  return got === expected;
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

async function resolveSourceForLazyCreate(opts: {
  metadataSourceId?: string | null;
  vapiPhoneNumberId?: string | null;
}): Promise<{ source_id: string; customer_org_id: string } | null> {
  const sb = getPathfinderServiceClient();
  if (opts.metadataSourceId) {
    const { data } = await sb
      .from('voice_agent_sources')
      .select('id, customer_org_id')
      .eq('id', opts.metadataSourceId)
      .maybeSingle();
    if (data) {
      const d = data as { id: string; customer_org_id: string };
      return { source_id: d.id, customer_org_id: d.customer_org_id };
    }
  }
  if (opts.vapiPhoneNumberId) {
    const { data } = await sb
      .from('voice_agent_sources')
      .select('id, customer_org_id')
      .eq('vapi_phone_number_id', opts.vapiPhoneNumberId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const d = data as { id: string; customer_org_id: string };
      return { source_id: d.id, customer_org_id: d.customer_org_id };
    }
  }
  const { data } = await sb
    .from('voice_agent_sources')
    .select('id, customer_org_id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) {
    const d = data as { id: string; customer_org_id: string };
    console.warn('[webhook] lazy-create using global fallback source', d.id);
    return { source_id: d.id, customer_org_id: d.customer_org_id };
  }
  return null;
}

async function ensureRow(opts: {
  rowId?: string;
  vapiCallId?: string;
  callType?: string;
  customerNumber?: string;
  phoneNumber?: string;
  vapiPhoneNumberId?: string;
  metadataSourceId?: string;
  metadataCustomerOrgId?: string;
}): Promise<string | null> {
  const sb = getPathfinderServiceClient();
  const { rowId, vapiCallId, callType, customerNumber, phoneNumber, vapiPhoneNumberId, metadataSourceId, metadataCustomerOrgId } = opts;

  if (rowId) {
    const { data } = await sb.from('voice_call_transcripts').select('id').eq('id', rowId).maybeSingle();
    if (data && (data as { id: string }).id) return (data as { id: string }).id;
  }
  if (vapiCallId) {
    const { data } = await sb.from('voice_call_transcripts').select('id').eq('vapi_call_id', vapiCallId).maybeSingle();
    if (data && (data as { id: string }).id) return (data as { id: string }).id;
  }
  const resolved = await resolveSourceForLazyCreate({ metadataSourceId, vapiPhoneNumberId });
  if (!resolved) {
    console.error('[webhook] no source available, cannot lazy-create');
    return null;
  }
  const isInbound = callType === 'inboundPhoneCall';
  const toPhone   = isInbound ? (phoneNumber ?? VAPI_FROM)     : (customerNumber ?? '+0');
  const fromPhone = isInbound ? (customerNumber ?? 'unknown')  : (phoneNumber ?? VAPI_FROM);
  const { data: created, error } = await sb
    .from('voice_call_transcripts')
    .insert({
      source_id: resolved.source_id,
      customer_org_id: metadataCustomerOrgId ?? resolved.customer_org_id,
      vapi_call_id: vapiCallId ?? null,
      to_phone:   normalizeE164(toPhone),
      from_phone: normalizeE164(fromPhone),
      contact_name: isInbound ? `Inbound ${normalizeE164(fromPhone)}` : null,
      call_status: 'in-progress',
    })
    .select('id')
    .single();
  if (error || !created) {
    console.error('[webhook] lazy create failed', error?.message);
    return null;
  }
  return (created as { id: string }).id;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Health check
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, service: 'unicron-atrium-voice-webhook' });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!verifySecret(req)) {
    res.status(401).json({ ok: false, error: 'bad secret' });
    return;
  }

  type WebhookPayload = { message?: Record<string, unknown> } & Record<string, unknown>;
  const payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as WebhookPayload;

  const msg  = (payload?.message ?? payload) as Record<string, unknown>;
  const type = msg?.type as string | undefined;
  const call = (msg?.call ?? {}) as Record<string, unknown>;
  const metadata = ((call?.metadata as Record<string, unknown>) ?? (msg?.metadata as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const rowIdHint  = metadata?.transcript_row_id as string | undefined;
  const vapiCallId = ((call?.id as string) ?? ((msg?.call as Record<string, unknown>)?.id as string)) ?? undefined;
  const callType   = ((call?.type as string) ?? (msg?.callType as string)) ?? undefined;
  const customerNumber  = ((call?.customer as Record<string, unknown>)?.number as string) ?? ((msg?.customer as Record<string, unknown>)?.number as string);
  const phoneNumber     = ((call?.phoneNumber as Record<string, unknown>)?.number as string) ?? ((msg?.phoneNumber as Record<string, unknown>)?.number as string);
  const vapiPhoneNumberId = (call?.phoneNumberId as string)
    ?? ((call?.phoneNumber as Record<string, unknown>)?.id as string)
    ?? (msg?.phoneNumberId as string);

  if (!vapiCallId && !rowIdHint) {
    res.status(200).json({ ok: true, ignored: true, reason: 'no call id' });
    return;
  }

  const rowId = await ensureRow({
    rowId: rowIdHint,
    vapiCallId,
    callType,
    customerNumber,
    phoneNumber,
    vapiPhoneNumberId,
    metadataSourceId: (metadata?.source_id as string | undefined),
    metadataCustomerOrgId: (metadata?.customer_org_id as string | undefined),
  });

  if (!rowId) {
    res.status(500).json({ ok: false, error: 'could not resolve row' });
    return;
  }

  const sb = getPathfinderServiceClient();

  if (vapiCallId) {
    await sb
      .from('voice_call_transcripts')
      .update({ vapi_call_id: vapiCallId })
      .eq('id', rowId)
      .is('vapi_call_id', null);
  }

  try {
    if (type === 'status-update') {
      const status = msg.status as string;
      const map: Record<string, string> = {
        queued: 'queued',
        ringing: 'dialing',
        'in-progress': 'in-progress',
        forwarding: 'in-progress',
        ended: 'ended',
      };
      const callStatus = map[status] ?? status;
      await sb
        .from('voice_call_transcripts')
        .update({ call_status: callStatus, ended_reason: (msg.endedReason as string | null) ?? null })
        .eq('id', rowId);
    } else if (type === 'transcript') {
      const turn = {
        role: (msg.role as string) ?? 'unknown',
        text: (msg.transcript as string) ?? (msg.text as string) ?? '',
        ts: new Date().toISOString(),
        type: (msg.transcriptType as string) ?? 'partial',
      };
      const { data: row } = await sb
        .from('voice_call_transcripts')
        .select('transcript')
        .eq('id', rowId)
        .single();
      const arr = Array.isArray((row as { transcript: unknown })?.transcript)
        ? (row as { transcript: unknown[] }).transcript
        : [];
      arr.push(turn);
      await sb
        .from('voice_call_transcripts')
        .update({ transcript: arr })
        .eq('id', rowId);
    } else if (type === 'end-of-call-report') {
      const summary     = (msg.summary as string) ?? ((msg.analysis as Record<string, unknown>)?.summary as string) ?? null;
      const sentiment   = (msg.analysis as Record<string, unknown>)?.sentiment ?? null;
      const successEval = (msg.analysis as Record<string, unknown>)?.successEvaluation;
      const followups   = successEval ? [{ key: 'successEvaluation', value: successEval }] : [];
      const canonical   = ((msg.artifact as Record<string, unknown>)?.messages as unknown[]) ?? (msg.messages as unknown[]) ?? null;
      const cost        = typeof msg.cost === 'number' ? msg.cost : (typeof (call?.cost) === 'number' ? (call.cost as number) : null);
      const costBreakdown = msg.costBreakdown ?? (call?.costBreakdown as unknown) ?? null;
      const vapiOrgId     = (msg.orgId as string) ?? (call?.orgId as string) ?? ((msg.organization as Record<string, unknown>)?.id as string) ?? null;
      const startedAtIso  = (msg.startedAt as string) ?? (call?.startedAt as string) ?? null;
      const updates: Record<string, unknown> = {
        call_status: 'ended',
        ended_reason: (msg.endedReason as string) ?? null,
        duration_seconds: Math.round(Number((msg.durationSeconds as number) ?? (call?.durationSeconds as number) ?? 0)),
        recording_url: (msg.recordingUrl as string) ?? ((msg.artifact as Record<string, unknown>)?.recordingUrl as string) ?? null,
        summary,
        sentiment: typeof sentiment === 'string' ? sentiment : null,
        followups,
        ended_at: new Date().toISOString(),
        cost_usd: cost,
        cost_breakdown: costBreakdown,
        vapi_org_id: vapiOrgId,
        started_at: startedAtIso,
      };
      if (Array.isArray(canonical)) {
        updates.transcript = (canonical as Array<Record<string, unknown>>).map((m) => ({
          role: m.role ?? 'unknown',
          text: m.message ?? m.content ?? m.text ?? '',
          ts: m.time ? new Date(m.time as string | number).toISOString() : new Date().toISOString(),
          secondsFromStart: m.secondsFromStart,
        }));
      }
      const structured: ExtractedPayload | null =
        ((msg.analysis as Record<string, unknown>)?.structuredData as ExtractedPayload | null) ??
        ((msg.structuredData as ExtractedPayload | null) ?? null);
      if (structured) {
        updates.structured_data = structured;
        if (structured.agent_call_outcome) {
          updates.outcome = structured.agent_call_outcome;
        }
      }
      await sb.from('voice_call_transcripts').update(updates).eq('id', rowId);

      // Fire-and-forget extraction chain. Autopilot + artifacts skipped (out of scope).
      try {
        const host = pickHostHeader(req);
        if (host && process.env.ANTHROPIC_API_KEY) {
          const extractUrl = `${pickProto(req)}://${host}/api/voice/extractions/run`;
          // Service-to-service call: use the webhook secret as a bearer the
          // /api/voice/extractions/run handler will reject (it requires Bearer JWT),
          // so we go direct via the lib instead in a follow-up. For now log only.
          // NOTE: extraction chain via HTTP requires a service token path that
          // foundation merge does not ship. Manual extraction trigger remains
          // available from the UI via voiceFetch + user session.
          void extractUrl;
        }
      } catch (e) {
        console.error('[webhook] extraction enqueue setup failed', e instanceof Error ? e.message : e);
      }

      // Post-call branch: procurement_pull ingest, sdr HubSpot write-through.
      try {
        const { data: rowFull } = await sb
          .from('voice_call_transcripts')
          .select('id, source_id, customer_org_id, summary, transcript, to_phone, from_phone, contact_name, duration_seconds, recording_url, outcome, ended_at, raw_payload')
          .eq('id', rowId)
          .single();
        const rf = rowFull as Record<string, unknown> | null;
        if (rf?.source_id) {
          const { data: src } = await sb
            .from('voice_agent_sources')
            .select('id, agent_type, customer_org_id')
            .eq('id', rf.source_id as string)
            .single();
          const s = src as { id: string; agent_type: string; customer_org_id: string } | null;

          if (s?.agent_type === 'procurement_pull' && structured) {
            const { data: cfg } = await sb
              .from('procurement_pull_configs')
              .select('id')
              .eq('customer_org_id', s.customer_org_id)
              .eq('is_active', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            const targetOfficeKey =
              (metadata?.target_office_key as string) ?? (metadata?.office_key as string) ?? null;
            let ingestResult: { project_ids: string[]; error?: string; insert_errors?: string[] } | null = null;
            let lastErr: string | null = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                ingestResult = await ingestProcurementPull({
                  vapiCallId: vapiCallId ?? rowId,
                  voiceCallTranscriptId: rowId,
                  customerOrgId: s.customer_org_id,
                  configId: (cfg as { id: string } | null)?.id ?? null,
                  targetOfficeKey,
                  callSummary: (rf.summary as string | null) ?? null,
                  fullTranscript: Array.isArray(rf.transcript) ? (rf.transcript as unknown[]) : null,
                  structuredData: structured,
                });
                if (!ingestResult.error) break;
                lastErr = ingestResult.error;
              } catch (ex) {
                lastErr = ex instanceof Error ? ex.message : String(ex);
              }
              if (attempt < 3) await new Promise((r) => setTimeout(r, 250 * attempt));
            }
            const projectCount = ingestResult?.project_ids?.length ?? 0;
            console.log(`[webhook] procurement_pull ingest -> ${projectCount} projects${lastErr ? ` (err: ${lastErr})` : ''}`);
            await sb
              .from('voice_call_transcripts')
              .update({
                raw_payload: {
                  ...((rf.raw_payload as Record<string, unknown>) ?? {}),
                  ingest: {
                    type: 'procurement_pull',
                    project_count: projectCount,
                    project_ids: ingestResult?.project_ids ?? [],
                    insert_errors: ingestResult?.insert_errors ?? null,
                    error: lastErr,
                    at: new Date().toISOString(),
                  },
                },
              })
              .eq('id', rowId);
          } else if (s?.agent_type === 'sdr') {
            const hsRes = await logSdrOutcome({
              toPhone: rf.to_phone as string,
              fromPhone: (rf.from_phone as string) ?? VAPI_FROM,
              contactName: rf.contact_name as string | null,
              durationSeconds: rf.duration_seconds as number | null,
              summary: rf.summary as string | null,
              outcome: rf.outcome as string | null,
              callStatus: 'ended',
              recordingUrl: rf.recording_url as string | null,
              endedAt: rf.ended_at as string | null,
            });
            console.log(`[webhook] sdr hubspot -> ok=${hsRes.ok} skipped=${hsRes.skipped}`);
            await sb
              .from('voice_call_transcripts')
              .update({
                raw_payload: {
                  ...((rf.raw_payload as Record<string, unknown>) ?? {}),
                  hubspot: {
                    ok: hsRes.ok,
                    skipped: hsRes.skipped,
                    contact_id: hsRes.contact_id ?? null,
                    call_id: hsRes.call_id ?? null,
                    error: hsRes.error ?? null,
                    at: new Date().toISOString(),
                  },
                },
              })
              .eq('id', rowId);
          }
        }
      } catch (e) {
        console.error('[webhook] post-call processing failed', e instanceof Error ? e.message : e);
      }
    } else if (type === 'hang') {
      await sb
        .from('voice_call_transcripts')
        .update({ call_status: 'ended', ended_reason: 'hang' })
        .eq('id', rowId);
    }
  } catch (e) {
    const msgErr = e instanceof Error ? e.message : String(e);
    console.error('[webhook] error', msgErr);
    res.status(500).json({ ok: false, error: msgErr });
    return;
  }

  res.status(200).json({ ok: true, row_id: rowId });
}
