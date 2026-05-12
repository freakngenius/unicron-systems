// /api/voice/sources
//
// GET    list (or fetch one with ?id=)
// POST   create source + create matching Vapi assistant
// PATCH  save edits as draft (does NOT push to Vapi); routing-only fields write straight
// DELETE delete source + delete Vapi assistant; refuses if procurement configs reference it
//
// Translated from prototype src/app/api/voice-sources/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin.js';
import { buildAssistantPayload } from '../../src/lib/voice/vapi.js';

const VAPI_BASE = 'https://api.vapi.ai';

const VarSpec = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  default: z.string().optional(),
  long: z.boolean().optional(),
});

const SourceBody = z.object({
  customer_org_id: z.string().min(1),
  source_name: z.string().min(1),
  agent_type: z.string().min(1),
  use_case_label: z.string().nullable().optional(),
  vertical: z.string().nullable().optional(),
  status: z.enum(['active', 'paused', 'archived']).default('active'),
  allowlist_phones: z.array(z.string()).default([]),
  voice_provider: z.enum(['11labs', 'elevenlabs']).default('11labs'),
  voice_id: z.string().nullable().optional(),
  voice_model: z.string().nullable().optional(),
  voice_stability: z.number().min(0).max(1).optional(),
  voice_similarity_boost: z.number().min(0).max(1).optional(),
  voice_style: z.number().min(0).max(1).optional(),
  voice_speed: z.number().min(0.7).max(1.2).optional(),
  voice_use_speaker_boost: z.boolean().optional(),
  llm_model: z.string().default('claude-sonnet-4-5-20250929'),
  llm_temperature: z.number().default(0.85),
  endpointing_wait_seconds: z.number().default(0.7),
  system_prompt: z.string().default(''),
  first_message: z.string().default(''),
  first_message_mode: z.enum([
    'assistant-speaks-first',
    'assistant-waits-for-user',
    'assistant-speaks-first-with-model-generated-message',
  ]).default('assistant-speaks-first'),
  knowledge_pack: z.record(z.string(), z.unknown()).default({}),
  variable_schema: z.array(VarSpec).default([]),
  vapi_phone_number_id: z.string().nullable().optional(),
  vapi_assistant_id: z.string().nullable().optional(),
  created_by_user_email: z.string().email().optional(),
  agent_goal: z.string().nullable().optional(),
  autopilot_enabled: z.boolean().optional(),
  autopilot_confidence_threshold: z.number().min(0).max(1).optional(),
  allowlist_mode: z.enum(['allowlist', 'hubspot', 'open']).optional(),
  hubspot_filter: z.object({
    pipeline_id: z.string().optional(),
    stage_ids: z.array(z.string()).optional(),
    list_id: z.string().optional(),
  }).nullable().optional(),
  open_mode_confirmed_by: z.string().nullable().optional(),
  open_mode_confirmed_at: z.string().nullable().optional(),
});

function vapiHeaders(): Record<string, string> {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error('VAPI_API_KEY not set');
  return { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
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
function envWebhook(req: VercelRequest): { serverUrl: string; serverSecret?: string } {
  const proto = pickProto(req);
  const host  = pickHostHeader(req);
  return {
    serverUrl: `${proto}://${host}/api/voice/webhook/vapi`,
    serverSecret: process.env.VAPI_WEBHOOK_SECRET,
  };
}

function vapiPayloadFor(req: VercelRequest, src: Record<string, unknown>) {
  const VALID_MODES = new Set([
    'assistant-speaks-first',
    'assistant-waits-for-user',
    'assistant-speaks-first-with-model-generated-message',
  ]);
  const mode = VALID_MODES.has(src.first_message_mode as string)
    ? (src.first_message_mode as string)
    : 'assistant-speaks-first';
  const firstMessage =
    mode === 'assistant-waits-for-user'
      ? ''
      : src.first_message && (src.first_message as string).trim().length > 0
        ? (src.first_message as string)
        : 'Hi, do you have a moment to talk?';

  const built = buildAssistantPayload({
    systemPrompt: src.system_prompt && (src.system_prompt as string).trim().length > 0
      ? (src.system_prompt as string)
      : `You are a voice agent for ${src.customer_org_id as string}. Be brief and professional.`,
    firstMessage,
    firstMessageMode: mode as 'assistant-speaks-first' | 'assistant-waits-for-user' | 'assistant-speaks-first-with-model-generated-message',
    voiceId: (src.voice_id as string | null) ?? process.env.ELEVENLABS_VOICE_ID ?? 'IKne3meq5aSn9XLyUdCD',
    voiceModel: (src.voice_model as string | null) ?? process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5',
    llmModel: (src.llm_model as string | null) ?? 'claude-sonnet-4-5-20250929',
    temperature: Number(src.llm_temperature ?? 0.85),
    endpointingWaitSeconds: Number(src.endpointing_wait_seconds ?? 0.7),
    voiceStability: src.voice_stability == null ? undefined : Number(src.voice_stability),
    voiceSimilarityBoost: src.voice_similarity_boost == null ? undefined : Number(src.voice_similarity_boost),
    voiceStyle: src.voice_style == null ? undefined : Number(src.voice_style),
    voiceSpeed: src.voice_speed == null ? undefined : Number(src.voice_speed),
    voiceUseSpeakerBoost: src.voice_use_speaker_boost == null ? undefined : Boolean(src.voice_use_speaker_boost),
  }, envWebhook(req));
  built.name = `${src.customer_org_id as string} · ${src.source_name as string}`;
  return built;
}

const ROUTING_FIELDS = new Set([
  'status', 'allowlist_phones', 'customer_org_id', 'vapi_phone_number_id',
  'vapi_assistant_id', 'source_name', 'use_case_label', 'agent_type', 'vertical',
  'agent_goal', 'autopilot_enabled', 'autopilot_confidence_threshold',
  'allowlist_mode', 'hubspot_filter', 'open_mode_confirmed_by', 'open_mode_confirmed_at',
]);

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const sb = getPathfinderServiceClient();
  const id = pickStr(req.query.id);

  // ===== GET =====
  if (req.method === 'GET') {
    if (id) {
      const { data, error } = await sb
        .from('voice_agent_sources')
        .select('*, variable_schema')
        .eq('id', id)
        .maybeSingle();
      if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
      if (!data)  { res.status(404).json({ ok: false, error: 'not found' }); return; }
      let assistant: unknown = null;
      const vapiAssistantId = (data as { vapi_assistant_id: string | null }).vapi_assistant_id;
      if (vapiAssistantId) {
        try {
          const r = await fetch(`${VAPI_BASE}/assistant/${vapiAssistantId}`, { headers: vapiHeaders() });
          if (r.ok) assistant = await r.json();
        } catch { /* fall through */ }
      }
      res.status(200).json({ ok: true, source: data, vapi_assistant: assistant });
      return;
    }
    const { data, error } = await sb
      .from('voice_agent_sources')
      .select('*, variable_schema')
      .order('created_at', { ascending: false });
    if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
    res.status(200).json({ ok: true, sources: data ?? [] });
    return;
  }

  // ===== POST (create) =====
  if (req.method === 'POST') {
    let body: z.infer<typeof SourceBody>;
    try {
      const raw = typeof req.body === 'string' ? safeParseJson(req.body) : req.body;
      body = SourceBody.parse(raw);
    } catch (e) {
      const err = e as Error;
      res.status(400).json({ ok: false, error: 'invalid body', details: err.message });
      return;
    }
    const { data: created, error } = await sb
      .from('voice_agent_sources')
      .insert({ ...body, created_by_user_email: body.created_by_user_email ?? auth.email })
      .select('*, variable_schema')
      .single();
    if (error || !created) {
      res.status(500).json({ ok: false, error: error?.message ?? 'insert failed' });
      return;
    }
    let vapiId: string | null = null;
    let vapiError: string | null = null;
    try {
      const payload = vapiPayloadFor(req, created as Record<string, unknown>);
      const r = await fetch(`${VAPI_BASE}/assistant`, {
        method: 'POST',
        headers: vapiHeaders(),
        body: JSON.stringify(payload),
      });
      const j = await r.json() as { id?: string };
      if (r.ok && j.id) {
        vapiId = j.id;
        await sb
          .from('voice_agent_sources')
          .update({ vapi_assistant_id: vapiId })
          .eq('id', (created as { id: string }).id);
      } else {
        vapiError = `vapi ${r.status}: ${JSON.stringify(j).slice(0, 300)}`;
      }
    } catch (e) {
      vapiError = e instanceof Error ? e.message : String(e);
    }
    res.status(200).json({
      ok: true,
      source: { ...created, vapi_assistant_id: vapiId },
      vapi_error: vapiError,
    });
    return;
  }

  // ===== PATCH (save draft) =====
  if (req.method === 'PATCH') {
    if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }
    let body: Partial<z.infer<typeof SourceBody>>;
    try {
      const raw = typeof req.body === 'string' ? safeParseJson(req.body) : req.body;
      body = SourceBody.partial().parse(raw);
    } catch (e) {
      const err = e as Error;
      res.status(400).json({ ok: false, error: 'invalid body', details: err.message });
      return;
    }

    const { data: current } = await sb
      .from('voice_agent_sources')
      .select('*, variable_schema')
      .eq('id', id)
      .maybeSingle();
    if (!current) { res.status(404).json({ ok: false, error: 'not found' }); return; }

    const cur = current as Record<string, unknown>;
    const routingPatch: Record<string, unknown> = {};
    const behaviorPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ROUTING_FIELDS.has(k)) routingPatch[k] = v;
      else behaviorPatch[k] = v;
    }
    const existingDraft = (cur.draft_config as Record<string, unknown> | null) ?? null;
    const baseDraft = existingDraft ?? {
      voice_id: cur.voice_id, voice_model: cur.voice_model,
      voice_stability: cur.voice_stability, voice_similarity_boost: cur.voice_similarity_boost,
      voice_style: cur.voice_style, voice_speed: cur.voice_speed,
      voice_use_speaker_boost: cur.voice_use_speaker_boost,
      voice_provider: cur.voice_provider, llm_model: cur.llm_model,
      llm_temperature: cur.llm_temperature, endpointing_wait_seconds: cur.endpointing_wait_seconds,
      system_prompt: cur.system_prompt, first_message: cur.first_message,
      first_message_mode: cur.first_message_mode, knowledge_pack: cur.knowledge_pack,
      variable_schema: cur.variable_schema,
    };
    const mergedDraft = { ...baseDraft, ...behaviorPatch };
    const hasDraft = Object.keys(behaviorPatch).length > 0 || !!existingDraft;

    const updatePayload: Record<string, unknown> = { ...routingPatch, updated_at: new Date().toISOString() };
    if (hasDraft) {
      updatePayload.draft_config = mergedDraft;
      updatePayload.has_draft = true;
    }

    const { data: updated, error } = await sb
      .from('voice_agent_sources')
      .update(updatePayload)
      .eq('id', id)
      .select('*, variable_schema')
      .single();
    if (error || !updated) {
      res.status(500).json({ ok: false, error: error?.message ?? 'update failed' });
      return;
    }
    res.status(200).json({ ok: true, source: updated });
    return;
  }

  // ===== DELETE =====
  if (req.method === 'DELETE') {
    if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }
    const { data: existing } = await sb
      .from('voice_agent_sources')
      .select('vapi_assistant_id')
      .eq('id', id)
      .maybeSingle();
    const { count } = await sb
      .from('procurement_pull_configs')
      .select('id', { count: 'exact', head: true })
      .eq('voice_agent_source_id', id);
    if ((count ?? 0) > 0) {
      res.status(409).json({ ok: false, error: `cannot delete: ${count} procurement config(s) reference this source` });
      return;
    }
    let vapiError: string | null = null;
    const vapiAssistantId = (existing as { vapi_assistant_id: string | null } | null)?.vapi_assistant_id;
    if (vapiAssistantId) {
      try {
        const r = await fetch(`${VAPI_BASE}/assistant/${vapiAssistantId}`, {
          method: 'DELETE',
          headers: vapiHeaders(),
        });
        if (!r.ok && r.status !== 404) {
          const j = await r.json().catch(() => ({}));
          vapiError = `vapi ${r.status}: ${JSON.stringify(j).slice(0, 300)}`;
        }
      } catch (e) {
        vapiError = e instanceof Error ? e.message : String(e);
      }
    }
    const { error } = await sb.from('voice_agent_sources').delete().eq('id', id);
    if (error) {
      res.status(500).json({ ok: false, error: error.message, vapi_error: vapiError });
      return;
    }
    res.status(200).json({ ok: true, vapi_error: vapiError });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
