// POST /api/voice/dispatch
//
// Body: { source_id: uuid, to_phone: string, contact_name?, related_project_id?,
//         related_lead_contact_id?, variables?, target_office_key?,
//         procurement_pull_config_id? }
//
// Hard-checks the per-source allowlist before placing any call. Always writes
// a voice_call_transcripts row, even on rejection, so we have a full audit
// trail. Behind requireVoiceAccess (Bearer JWT + metacron.operator_allowlist).
//
// Translated from prototype src/app/api/dispatch/route.ts.
//
// Stubbed dependencies (out-of-scope per spec §7):
//   - memoryPack: per-call context pack omitted; calls go out without
//     historical variables. Document in PR.
//   - promptVersions: A/B variant pick omitted; uses source row's
//     system_prompt + first_message directly.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin';
import { assertAllowlistedForSource } from '../../src/lib/voice/allowlist';
import { buildAssistantPayload, placeOutboundCall } from '../../src/lib/voice/vapi';
import { buildSystemPrompt } from '../../src/lib/voice/systemPrompt';
import { DEFAULT_LLM_MODEL, isKnownModel } from '../../src/lib/voice/llmCatalog';

const Body = z.object({
  source_id: z.string().uuid(),
  to_phone: z.string().min(7),
  contact_name: z.string().optional(),
  related_project_id: z.string().optional(),
  related_lead_contact_id: z.string().uuid().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  target_office_key: z.string().optional(),
  procurement_pull_config_id: z.string().uuid().optional(),
});

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  let parsed: z.infer<typeof Body>;
  try {
    const raw = typeof req.body === 'string' ? safeParseJson(req.body) : req.body;
    parsed = Body.parse(raw);
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ ok: false, error: 'invalid body', details: err.message });
    return;
  }

  const supabase = getPathfinderServiceClient();

  // 1. Load source row
  const { data: source, error: srcErr } = await supabase
    .from('voice_agent_sources')
    .select('*')
    .eq('id', parsed.source_id)
    .single();
  if (srcErr || !source) {
    res.status(404).json({ ok: false, error: 'source not found', details: srcErr?.message });
    return;
  }

  // 2. Status lock
  if ((source as { status: string }).status !== 'active') {
    res.status(403).json({ ok: false, error: `source status is ${(source as { status: string }).status}, refusing to dial` });
    return;
  }

  // 3. Allowlist hard-check (mode-aware)
  const check = await assertAllowlistedForSource(parsed.to_phone, source as Record<string, unknown>);
  if (!check.ok) {
    await supabase.from('voice_call_transcripts').insert({
      source_id: (source as { id: string }).id,
      customer_org_id: (source as { customer_org_id: string }).customer_org_id,
      to_phone: check.phone,
      from_phone: process.env.VAPI_FROM_NUMBER ?? '+17377026283',
      contact_name: parsed.contact_name ?? null,
      related_project_id: parsed.related_project_id ?? null,
      related_lead_contact_id: parsed.related_lead_contact_id ?? null,
      call_status: 'rejected_not_allowlisted',
      ended_reason: `[${check.mode}] ${check.reason}`,
    });
    res.status(403).json({ ok: false, error: 'phone not allowlisted', mode: check.mode, reason: check.reason });
    return;
  }

  // 4. Build assistant payload (no A/B variant in foundation merge — uses source row directly)
  const src = source as Record<string, unknown>;
  const systemPrompt = buildSystemPrompt({
    basePrompt: src.system_prompt as string,
    contactName: parsed.contact_name,
    vertical: (src.vertical as string | null) ?? undefined,
  });
  const firstMessage = src.first_message as string;
  const firstMessageMode = (src.first_message_mode as string) ?? 'assistant-speaks-first';

  const requested = (src.llm_model as string | null) ?? DEFAULT_LLM_MODEL;
  const llmModelResolved = isKnownModel(requested) ? requested : DEFAULT_LLM_MODEL;

  const proto = pickProto(req);
  const host  = pickHostHeader(req);
  const webhookUrl = `${proto}://${host}/api/voice/webhook/vapi`;

  const assistant = buildAssistantPayload({
    systemPrompt,
    firstMessage,
    firstMessageMode: firstMessageMode as 'assistant-speaks-first' | 'assistant-waits-for-user' | 'assistant-speaks-first-with-model-generated-message',
    voiceId: (src.voice_id as string | null) ?? process.env.ELEVENLABS_VOICE_ID ?? 'IKne3meq5aSn9XLyUdCD',
    voiceModel: (src.voice_model as string | null) ?? process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5',
    llmModel: llmModelResolved,
    temperature: Number(src.llm_temperature ?? 0.85),
    endpointingWaitSeconds: Number(src.endpointing_wait_seconds ?? 0.7),
  }, {
    serverUrl: webhookUrl,
    serverSecret: process.env.VAPI_WEBHOOK_SECRET,
  });

  const apiKey = process.env.VAPI_API_KEY;
  const phoneNumberId = (src.vapi_phone_number_id as string | null) ?? process.env.VAPI_PHONE_NUMBER_ID;
  if (!apiKey || !phoneNumberId) {
    res.status(500).json({ ok: false, error: 'VAPI_API_KEY or VAPI_PHONE_NUMBER_ID not configured' });
    return;
  }

  // 5. Pre-insert transcript row (queued)
  const { data: pre, error: preErr } = await supabase
    .from('voice_call_transcripts')
    .insert({
      source_id: src.id,
      customer_org_id: src.customer_org_id,
      to_phone: check.phone,
      from_phone: process.env.VAPI_FROM_NUMBER ?? '+17377026283',
      callee_phone: check.phone,
      contact_name: parsed.contact_name ?? null,
      related_project_id: parsed.related_project_id ?? null,
      related_lead_contact_id: parsed.related_lead_contact_id ?? null,
      call_status: 'queued',
      prompt_version_id: null,    // Stubbed: see file header re promptVersions
      memory_pack_id: null,       // Stubbed: see file header re memoryPack
    })
    .select('id')
    .single();
  if (preErr || !pre) {
    res.status(500).json({ ok: false, error: 'failed to create transcript row', details: preErr?.message });
    return;
  }

  // 6. Place the call via Vapi
  const placed = await placeOutboundCall({
    apiKey,
    phoneNumberId,
    toPhone: check.phone,
    assistantId: (src.vapi_assistant_id as string | null) ?? undefined,
    assistant: src.vapi_assistant_id ? undefined : assistant,
    variables: { ...(parsed.variables ?? {}) },
    metadata: {
      transcript_row_id: pre.id,
      source_id: src.id,
      agent_type: src.agent_type,
      customer_org_id: src.customer_org_id,
      contact_name: parsed.contact_name ?? null,
      related_project_id: parsed.related_project_id ?? null,
      related_lead_contact_id: parsed.related_lead_contact_id ?? null,
      target_office_key: parsed.target_office_key ?? null,
      procurement_pull_config_id: parsed.procurement_pull_config_id ?? null,
    },
  });

  if (!placed.ok) {
    await supabase
      .from('voice_call_transcripts')
      .update({ call_status: 'failed', ended_reason: `vapi ${placed.status}: ${JSON.stringify(placed.body).slice(0, 500)}` })
      .eq('id', pre.id);
    res.status(502).json({ ok: false, error: 'vapi rejected', status: placed.status, body: placed.body });
    return;
  }

  await supabase
    .from('voice_call_transcripts')
    .update({ call_status: 'dialing', vapi_call_id: placed.body?.id ?? null })
    .eq('id', pre.id);

  res.status(200).json({
    ok: true,
    transcript_row_id: pre.id,
    vapi_call_id: placed.body?.id,
    to_phone: check.phone,
  });
}
