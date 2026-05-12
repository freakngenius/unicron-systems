// POST /api/voice/sources/:id/publish
//
// Promotes draft_config → canonical columns and syncs to the linked Vapi
// assistant. Creates the assistant if one doesn't exist. Idempotent.
//
// Translated from prototype src/app/api/voice-sources/[id]/publish/route.ts.
//
// Stubbed (out-of-scope per spec §7): agent_prompt_versions A/B versioning.
// Foundation merge skips the version-bookkeeping insert. Document in PR.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../../../_lib/voiceAuth.js';
import { getPathfinderServiceClient } from '../../../_lib/supabaseAdmin.js';
import { buildAssistantPayload } from '../../../../src/lib/voice/vapi.js';

const VAPI_BASE = 'https://api.vapi.ai';

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
  return {
    serverUrl: `${pickProto(req)}://${pickHostHeader(req)}/api/voice/webhook/vapi`,
    serverSecret: process.env.VAPI_WEBHOOK_SECRET,
  };
}
function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
const PLACEHOLDER_RE = /^(\s*|managed-on-vapi-assistant|placeholder.*|todo.*|tbd.*)$/i;
function isPlaceholder(s: string | null | undefined): boolean {
  if (!s) return true;
  return PLACEHOLDER_RE.test(s.trim());
}
const VALID_FIRST_MSG_MODES = new Set([
  'assistant-speaks-first',
  'assistant-waits-for-user',
  'assistant-speaks-first-with-model-generated-message',
]);

function vapiPayloadFor(req: VercelRequest, src: Record<string, unknown>) {
  const mode = VALID_FIRST_MSG_MODES.has(src.first_message_mode as string)
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const id = pickStr(req.query.id);
  if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }

  const sb = getPathfinderServiceClient();
  const { data: current, error: loadErr } = await sb
    .from('voice_agent_sources')
    .select('*, variable_schema')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !current) {
    res.status(404).json({ ok: false, error: 'not found' });
    return;
  }

  // Promote draft into canonical columns (if any).
  const cur = current as Record<string, unknown>;
  const draft = (cur.draft_config as Record<string, unknown> | null) ?? null;
  const promoted: Record<string, unknown> = { ...cur };
  if (draft) for (const k of Object.keys(draft)) promoted[k] = draft[k];

  // Placeholder guard
  const waitsForUser = promoted.first_message_mode === 'assistant-waits-for-user';
  if (!waitsForUser && isPlaceholder(promoted.first_message as string)) {
    res.status(400).json({
      ok: false,
      error: "first_message is empty or a placeholder. Edit the agent's first message in Atrium before publishing.",
    });
    return;
  }
  if (isPlaceholder(promoted.system_prompt as string)) {
    res.status(400).json({
      ok: false,
      error: "system_prompt is empty or a placeholder. Edit the agent's system prompt in Atrium before publishing.",
    });
    return;
  }

  // Persist promotion + clear draft markers
  if (draft) {
    const writable: Record<string, unknown> = {
      voice_id: promoted.voice_id,
      voice_model: promoted.voice_model,
      voice_stability: promoted.voice_stability,
      voice_similarity_boost: promoted.voice_similarity_boost,
      voice_style: promoted.voice_style,
      voice_speed: promoted.voice_speed,
      voice_use_speaker_boost: promoted.voice_use_speaker_boost,
      voice_provider: promoted.voice_provider,
      llm_model: promoted.llm_model,
      llm_temperature: promoted.llm_temperature,
      endpointing_wait_seconds: promoted.endpointing_wait_seconds,
      system_prompt: promoted.system_prompt,
      first_message: promoted.first_message,
      first_message_mode: promoted.first_message_mode,
      knowledge_pack: promoted.knowledge_pack,
      variable_schema: promoted.variable_schema,
      draft_config: null,
      has_draft: false,
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await sb
      .from('voice_agent_sources')
      .update(writable)
      .eq('id', id);
    if (upErr) {
      res.status(500).json({ ok: false, error: `db: ${upErr.message}` });
      return;
    }
  }

  // Push to Vapi (create or patch)
  const payload = vapiPayloadFor(req, promoted);
  let vapiAssistantId: string | null = (promoted.vapi_assistant_id as string | null) ?? null;
  let vapiError: string | null = null;

  try {
    if (vapiAssistantId) {
      const r = await fetch(`${VAPI_BASE}/assistant/${vapiAssistantId}`, {
        method: 'PATCH',
        headers: vapiHeaders(),
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        vapiError = `vapi ${r.status}: ${JSON.stringify(j).slice(0, 300)}`;
      }
    } else {
      const r = await fetch(`${VAPI_BASE}/assistant`, {
        method: 'POST',
        headers: vapiHeaders(),
        body: JSON.stringify(payload),
      });
      const j = await r.json() as { id?: string };
      if (r.ok && j.id) {
        vapiAssistantId = j.id;
      } else {
        vapiError = `vapi create ${r.status}: ${JSON.stringify(j).slice(0, 300)}`;
      }
    }
  } catch (e) {
    vapiError = e instanceof Error ? e.message : String(e);
  }

  const finalUpdate: Record<string, unknown> = {};
  if (!vapiError) finalUpdate.published_at = new Date().toISOString();
  if (vapiAssistantId && vapiAssistantId !== promoted.vapi_assistant_id) {
    finalUpdate.vapi_assistant_id = vapiAssistantId;
  }
  if (Object.keys(finalUpdate).length > 0) {
    await sb.from('voice_agent_sources').update(finalUpdate).eq('id', id);
  }

  const { data: fresh } = await sb
    .from('voice_agent_sources')
    .select('*, variable_schema')
    .eq('id', id)
    .maybeSingle();

  res.status(vapiError ? 502 : 200).json({
    ok: !vapiError,
    source: fresh,
    vapi_error: vapiError,
  });
}
