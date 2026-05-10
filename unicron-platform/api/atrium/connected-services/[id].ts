// PATCH /api/atrium/connected-services/:id — update cost, status, notes
//
// Uses ns_patch_connected_service RPC (public schema, SECURITY DEFINER).
// Taboo-checked. Audit-logged via ns_append_ledger_signal.
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

async function tabooCheck(text: string): Promise<{ blocked: boolean; reason?: string }> {
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) return { blocked: false };
  try {
    const res = await fetch(
      'https://api.github.com/repos/freakngenius/unicron-knowledge/contents/wiki/memory/taboos.md',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3.raw',
          'User-Agent': 'unicron-platform/1.0',
        },
      },
    );
    if (!res.ok) return { blocked: false };
    const content = await res.text();
    const lc = text.toLowerCase();
    for (const line of content.split('\n').filter((l) => l.trim().startsWith('-'))) {
      const phrase = line.replace(/^-+\s*/, '').trim().toLowerCase();
      if (phrase && lc.includes(phrase)) return { blocked: true, reason: `Taboo match: "${phrase}"` };
    }
  } catch { /* fail open */ }
  return { blocked: false };
}

async function auditLog(action: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const sb = getServiceClient();
    await sb.rpc('ns_append_ledger_signal', {
      p_source_type: 'audit',
      p_source_id: 'atrium/connected-services/:id',
      p_summary: action,
      p_insights: payload,
    });
  } catch { /* non-fatal */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const id = req.query['id'];
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing service id in path' });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || Object.keys(body).length === 0) {
    res.status(400).json({ error: 'Empty patch body' });
    return;
  }

  const taboo = await tabooCheck([body.name ?? '', body.notes ?? ''].join(' '));
  if (taboo.blocked) {
    res.status(422).json({ error: 'Taboo check failed', reason: taboo.reason });
    return;
  }

  try {
    const sb = getServiceClient();
    const { data, error } = await sb.rpc('ns_patch_connected_service', {
      p_id: id,
      p_name: body.name ?? null,
      p_category: body.category ?? null,
      p_status: body.status ?? null,
      p_monthly_cost_usd: body.monthly_cost_usd ?? null,
      p_last_billed_at: body.last_billed_at ?? null,
      p_config_url: body.config_url ?? null,
      p_notes: body.notes ?? null,
      p_owner_team_member_id: body.owner_team_member_id ?? null,
      p_acknowledged: body.acknowledged ?? null,
      p_last_health_check_at: body.last_health_check_at ?? null,
    });
    if (error) throw error;
    const service = Array.isArray(data) ? data[0] : data;
    await auditLog('patch', { service_id: id, patch: body });
    res.status(200).json({ service });
  } catch (err) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
    res.status(500).json({ error: msg });
  }
}
