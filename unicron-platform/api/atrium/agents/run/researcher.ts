// POST /api/atrium/agents/run/researcher — Sprint 7.5 reification
// Body: { topic: string, for_date?: 'YYYY-MM-DD' }
import type { VercelRequest, VercelResponse } from '@vercel/node';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const topicRaw = body['topic'];
  if (typeof topicRaw !== 'string' || topicRaw.trim().length === 0) {
    res.status(400).json({ ok: false, error: 'topic (string) is required' });
    return;
  }
  const topic = topicRaw.trim();
  const forDateRaw = body['for_date'];
  let forDate: string | undefined;
  if (typeof forDateRaw === 'string' && forDateRaw.length > 0) {
    if (!DATE_RE.test(forDateRaw)) {
      res.status(400).json({ ok: false, error: 'for_date must be YYYY-MM-DD' });
      return;
    }
    forDate = forDateRaw;
  }
  try {
    const { researcherBrief } = await import('../../../../lib/agents/researcher.js');
    const result = await researcherBrief({ topic, forDate });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
