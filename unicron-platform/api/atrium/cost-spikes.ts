// GET  /api/atrium/cost-spikes — return cost spike alerts from nervous_system.ledger
// POST /api/atrium/cost-spikes — acknowledge a spike (marks acknowledged=true on
//   the linked connected_service or updates a ledger row payload).
//
// Falls back to a stub empty array if nervous_system.ledger has no cost_spike rows.
// Sprint 5 Stream F.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key, { db: { schema: 'nervous_system' } });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const sb = getServiceClient();

      // Query ledger for cost_spike signal_type
      const { data, error } = await sb
        .from('ledger')
        .select('id, created_at, signal_type, source, payload')
        .eq('signal_type', 'cost_spike')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // If ledger table doesn't exist yet or has no cost_spike rows, return stub
        res.status(200).json({ spikes: [] });
        return;
      }

      // Normalise ledger rows into spike shape
      const spikes = (data ?? []).map((row) => {
        const p = (row.payload ?? {}) as Record<string, unknown>;
        return {
          id: row.id as string,
          ts: row.created_at as string,
          category: (p['category'] as string | undefined) ?? row.source ?? 'unknown',
          service: (p['service'] as string | undefined) ?? row.source ?? '—',
          baseline_amount: (p['baseline_amount'] as number | undefined) ?? 0,
          spike_amount: (p['spike_amount'] as number | undefined) ?? 0,
          spike_ratio: (p['spike_ratio'] as number | undefined) ?? 0,
          reason: (p['reason'] as string | undefined) ?? '',
          acknowledged: (p['acknowledged'] as boolean | undefined) ?? false,
        };
      });

      res.status(200).json({ spikes });
    } catch (err) {
      // Graceful fallback — spike monitoring is best-effort
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[cost-spikes GET]', msg);
      res.status(200).json({ spikes: [] });
    }
    return;
  }

  // ── POST (acknowledge) ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown> | undefined;
    const spikeId = body?.['id'];

    if (!spikeId || typeof spikeId !== 'string') {
      res.status(400).json({ error: 'Missing required field: id' });
      return;
    }

    try {
      const sb = getServiceClient();

      // Read current payload and set acknowledged = true
      const { data: row, error: fetchErr } = await sb
        .from('ledger')
        .select('payload')
        .eq('id', spikeId)
        .single();

      if (fetchErr) throw fetchErr;

      const updatedPayload = {
        ...((row?.payload ?? {}) as Record<string, unknown>),
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
      };

      const { error: updateErr } = await sb
        .from('ledger')
        .update({ payload: updatedPayload })
        .eq('id', spikeId);

      if (updateErr) throw updateErr;

      res.status(200).json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
