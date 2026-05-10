// GET  /api/atrium/decay-heatmap — signal topic decay data via ns_decay_heatmap RPC
// GET  /api/atrium/decay-heatmap?topic=<topic> — signals for a single topic via ns_get_signals_by_topic
// POST /api/atrium/decay-heatmap — archive a topic cluster (Taboo Keeper check + ns_archive_topic)
// Sprint 7 Stream C — Task 4
//
// Verified signals schema:
//   id (uuid), created_at, source_agent (uuid), topic (text), signal_type (text),
//   content (text), evidence_ledger_ids (uuid[]), strength (float8),
//   ttl_days (int), last_touched (timestamptz), status (text)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // GET — list heatmap topics or signals for a specific topic
  if (req.method === 'GET') {
    const { topic, limit: limitRaw } = req.query as Record<string, string | undefined>;

    try {
      const sb = getServiceClient();

      if (topic) {
        // Single-topic signal list
        const { data, error } = await sb.rpc('ns_get_signals_by_topic', { p_topic: topic });
        if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
        res.status(200).json({ ok: true, signals: data ?? [] });
      } else {
        // Aggregate heatmap
        const p_limit = Math.min(parseInt(limitRaw ?? '50', 10) || 50, 200);
        const { data, error } = await sb.rpc('ns_decay_heatmap', { p_limit });
        if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
        res.status(200).json({ ok: true, topics: data ?? [] });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // POST — archive cluster (Taboo Keeper check first)
  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown> | undefined;
    const topic        = body?.['topic'];
    const triggered_by = (body?.['triggered_by'] as string | undefined) ?? 'operator';

    if (!topic || typeof topic !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing required field: topic' });
      return;
    }

    try {
      const sb = getServiceClient();

      // Taboo Keeper check
      const tabooCheck = await sb.rpc('ns_check_taboo', {
        p_action:    'topic.archive',
        p_target:    topic,
        p_actor:     triggered_by,
        p_context:   JSON.stringify({ topic }),
      });

      if (tabooCheck.error) {
        // If taboo check RPC doesn't exist yet, proceed (non-blocking)
        console.warn('Taboo check skipped:', tabooCheck.error.message);
      } else if (tabooCheck.data?.blocked === true) {
        res.status(403).json({
          ok: false,
          blocked: true,
          reason: tabooCheck.data?.reason ?? 'Taboo Keeper blocked this action',
        });
        return;
      }

      const { data, error } = await sb.rpc('ns_archive_topic', {
        p_topic: topic,
        p_triggered_by: triggered_by,
      });

      if (error) { res.status(500).json({ ok: false, error: error.message }); return; }

      res.status(200).json({ ok: true, result: data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
