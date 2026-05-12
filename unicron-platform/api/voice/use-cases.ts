// GET /api/voice/use-cases
//
// Returns dropdown options for the agent "Use case" field — built-in seeds
// unioned with custom labels previously saved on voice_agent_sources, deduped
// on agent_type.
//
// Translated from prototype src/app/api/use-cases/route.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireVoiceAccess, denyResponse } from '../_lib/voiceAuth';
import { getPathfinderServiceClient } from '../_lib/supabaseAdmin';

const SEEDS = [
  { agent_type: 'procurement_pull',     label: 'Procurement pull' },
  { agent_type: 'sdr',                  label: 'SDR / Top of funnel' },
  { agent_type: 'procurement_checkin',  label: 'Procurement weekly check-in' },
  { agent_type: 'discovery',            label: 'Discovery' },
];

function humanize(slug: string): string {
  return slug
    .split(/[_-]+/)
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await requireVoiceAccess(req, res);
  if (!auth.ok) { denyResponse(res, auth); return; }

  const sb = getPathfinderServiceClient();
  const { data, error } = await sb
    .from('voice_agent_sources')
    .select('agent_type, use_case_label');
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }

  const dedup = new Map<string, { agent_type: string; label: string }>();
  for (const s of SEEDS) dedup.set(s.agent_type, s);
  for (const row of data ?? []) {
    const slug = (row as { agent_type: string | null }).agent_type;
    if (!slug) continue;
    const label =
      (row as { use_case_label: string | null }).use_case_label ?? humanize(slug);
    if (!dedup.has(slug)) dedup.set(slug, { agent_type: slug, label });
  }
  res.status(200).json({
    ok: true,
    use_cases: Array.from(dedup.values()).sort((a, b) => a.label.localeCompare(b.label)),
  });
}
