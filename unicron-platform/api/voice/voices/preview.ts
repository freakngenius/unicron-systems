// POST /api/voice/voices/preview
//
// Generates a short ElevenLabs TTS sample so operators can hear voice settings
// before saving. Returns audio/mpeg bytes streamed back as a binary response.
//
// Translated from prototype src/app/api/voices/preview/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../../_lib/voiceAuth';

const DEFAULT_TEXT =
  "Hi, this is a quick sample of how I'll sound on the call. Let me know if you'd like me to adjust the warmth, pace, or style.";

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
function clampRange(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: 'ELEVENLABS_API_KEY not set' });
    return;
  }

  const body = (typeof req.body === 'string' ? safeParseJson(req.body) : req.body) as
    | Record<string, unknown>
    | null;
  if (!body) { res.status(400).json({ ok: false, error: 'invalid body' }); return; }

  const voiceId = body.voice_id as string | undefined;
  if (!voiceId) { res.status(400).json({ ok: false, error: 'voice_id required' }); return; }

  const text = String(body.text ?? DEFAULT_TEXT).slice(0, 600);
  const model = (body.voice_model as string | undefined) ?? 'eleven_turbo_v2_5';
  const settings = {
    stability:        clamp01(body.stability,        0.5),
    similarity_boost: clamp01(body.similarity_boost, 0.75),
    style:            clamp01(body.style,            0.0),
    speed:            clampRange(body.speed,         1.0, 0.7, 1.2),
    use_speaker_boost: body.use_speaker_boost ?? true,
  };

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
    },
  );
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    res.status(502).json({ ok: false, error: `elevenlabs ${r.status}: ${errBody.slice(0, 300)}` });
    return;
  }
  const audio = Buffer.from(await r.arrayBuffer());
  res.setHeader('content-type', 'audio/mpeg');
  res.setHeader('cache-control', 'no-store');
  res.status(200).send(audio);
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
