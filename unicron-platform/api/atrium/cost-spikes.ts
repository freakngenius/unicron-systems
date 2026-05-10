// GET  /api/atrium/cost-spikes — return cost spike alerts from nervous_system.ledger
// POST /api/atrium/cost-spikes — acknowledge a spike
//
// Uses ns_list_cost_spikes / ns_acknowledge_cost_spike RPCs.
// Graceful fallback to empty array on any error (spike monitoring is best-effort).
// Sprint 5 Stream F.

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

  if (req.method === 'GET') {
    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_list_cost_spikes');
      if (error) { res.status(200).json({ spikes: [] }); return; }

      const spikes = (data ?? []).map((row: Record<string, unknown>) => {
        const ins = (row['insights'] ?? {}) as Record<string, unknown>;
        return {
          id: row['id'],
          ts: row['created_at'],
          category: (ins['category'] as string | undefined) ?? row['source_id'] ?? 'unknown',
          service: (ins['service'] as string | undefined) ?? row['source_id'] ?? '—',
          baseline_amount: (ins['baseline_amount'] as number | undefined) ?? 0,
          spike_amount: (ins['spike_amount'] as number | undefined) ?? 0,
          spike_ratio: (ins['spike_ratio'] as number | undefined) ?? 0,
          reason: (ins['reason'] as string | undefined) ?? (row['content_summary'] as string | undefined) ?? '',
          acknowledged: (ins['acknowledged'] as boolean | undefined) ?? false,
        };
      });

      res.status(200).json({ spikes });
    } catch {
      res.status(200).json({ spikes: [] });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown> | undefined;
    const spikeId = body?.['id'];
    if (!spikeId || typeof spikeId !== 'string') {
      res.status(400).json({ error: 'Missing required field: id' });
      return;
    }
    try {
      const sb = getServiceClient();
      const { error } = await sb.rpc('ns_acknowledge_cost_spike', { p_id: spikeId });
      if (error) throw error;
      res.status(200).json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
