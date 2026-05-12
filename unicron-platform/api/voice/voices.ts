// GET /api/voice/voices
//
// Read-only proxy for the voice picker. Returns ElevenLabs voices, with
// 5-minute in-memory cache so the picker stays snappy. Falls back to a single
// curated default if ELEVENLABS_API_KEY is unset.
//
// Translated from prototype src/app/api/voices/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth.js';

type VoiceRow = {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string | null;
  category?: string;
};

let cache: { at: number; voices: VoiceRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

async function fetchElevenLabs(): Promise<VoiceRow[]> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return [{
      voice_id: 'IKne3meq5aSn9XLyUdCD',
      name: 'Charlie (default Boardy)',
      labels: { accent: 'American', description: 'Casual, warm' },
      preview_url: null,
      category: 'default',
    }];
  }
  const r = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key },
  });
  if (!r.ok) {
    throw new Error(`elevenlabs ${r.status}: ${await r.text().then((t) => t.slice(0, 200))}`);
  }
  const j = await r.json() as { voices?: Array<Record<string, unknown>> };
  return (j.voices ?? []).map((v) => ({
    voice_id: v.voice_id as string,
    name: v.name as string,
    labels: (v.labels as Record<string, string>) ?? {},
    preview_url: (v.preview_url as string | null) ?? null,
    category: (v.category as string) ?? 'generated',
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      res.status(200).json({ ok: true, voices: cache.voices, cached: true });
      return;
    }
    const voices = await fetchElevenLabs();
    cache = { at: Date.now(), voices };
    res.status(200).json({ ok: true, voices, cached: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: msg });
  }
}
