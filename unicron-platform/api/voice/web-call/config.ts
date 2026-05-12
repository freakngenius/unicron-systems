// GET /api/voice/web-call/config?source_id=...
//
// Returns the data needed to start a browser-side Vapi call using @vapi-ai/web:
//   - public_key  (safe to expose to browser; from VITE_VAPI_PUBLIC_KEY)
//   - assistant_id (the Vapi assistant linked to the source)
//   - source_name + customer_org_id (for UI display)
//
// Translated from prototype src/app/api/web-call/config/route.ts.
//
// Stubbed dependencies (out-of-scope per spec §7):
//   - memoryPack: prototype builds a per-call context pack. Atrium foundation
//     ships without it; web calls get no historical context. Document in PR.
//   - promptVersions: prototype picks an A/B variant. Atrium foundation
//     defaults to the assistant's published prompt only.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../../_lib/voiceAuth';
import { getPathfinderServiceClient } from '../../_lib/supabaseAdmin';

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const sourceId = pickStr(req.query.source_id);
  if (!sourceId) { res.status(400).json({ ok: false, error: 'source_id required' }); return; }

  // Renamed from NEXT_PUBLIC_VAPI_PUBLIC_KEY → VITE_VAPI_PUBLIC_KEY per spec §11
  // (Vite uses VITE_ prefix; the value still surfaces to the browser bundle).
  const publicKey = process.env.VITE_VAPI_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  if (!publicKey) {
    res.status(500).json({ ok: false, error: 'VITE_VAPI_PUBLIC_KEY not set' });
    return;
  }

  const sb = getPathfinderServiceClient();
  const { data, error } = await sb
    .from('voice_agent_sources')
    .select('id, source_name, customer_org_id, vapi_assistant_id, status, has_draft')
    .eq('id', sourceId)
    .maybeSingle();

  if (error || !data) { res.status(404).json({ ok: false, error: 'source not found' }); return; }
  if (!data.vapi_assistant_id) {
    res.status(409).json({ ok: false, error: 'Source has no Vapi assistant. Publish the agent first to create one.' });
    return;
  }
  if (data.status !== 'active') {
    res.status(403).json({ ok: false, error: `source status is ${data.status}` });
    return;
  }

  res.status(200).json({
    ok: true,
    public_key: publicKey,
    assistant_id: data.vapi_assistant_id,
    source_name: data.source_name,
    customer_org_id: data.customer_org_id,
    has_draft: data.has_draft,
    variant: null,            // Stubbed: see file header re promptVersions
    memory_pack_id: null,     // Stubbed: see file header re memoryPack
    variable_values: {},
    assistant_overrides: {},
  });
}
