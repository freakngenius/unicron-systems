// GET  /api/atrium/connected-services — list all connected services
// POST /api/atrium/connected-services — register a new service
//
// Both operations are Taboo-checked and audit-logged via Supabase service_role.
// Sprint 5 Stream F.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Supabase service-role client (server-only) ────────────────────────────────

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key, { db: { schema: 'nervous_system' } });
}

// ── Taboo check helper ────────────────────────────────────────────────────────

async function tabooCheck(text: string): Promise<{ blocked: boolean; reason?: string }> {
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) return { blocked: false }; // graceful degrade if vault unavailable

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
    const lines = content.split('\n').filter((l) => l.trim().startsWith('-'));
    for (const line of lines) {
      const phrase = line.replace(/^-+\s*/, '').trim().toLowerCase();
      if (phrase && lc.includes(phrase)) {
        return { blocked: true, reason: `Taboo match: "${phrase}"` };
      }
    }
  } catch {
    // Vault unreachable — allow through (fail open)
  }
  return { blocked: false };
}

// ── Audit log helper ──────────────────────────────────────────────────────────

async function auditLog(
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const sb = getServiceClient();
    await sb.from('ledger').insert({
      signal_type: 'audit',
      source: 'atrium/connected-services',
      payload: { action, ...payload },
    });
  } catch {
    // Non-fatal — audit log failure should not break the main operation
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // CORS for atrium.unicron.systems
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
      const { data, error } = await sb
        .from('connected_services')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      res.status(200).json({ services: data ?? [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body?.name || typeof body.name !== 'string') {
      res.status(400).json({ error: 'Missing required field: name' });
      return;
    }

    // Taboo check on name + notes
    const textToCheck = [body.name, body.notes ?? ''].join(' ');
    const taboo = await tabooCheck(textToCheck);
    if (taboo.blocked) {
      res.status(422).json({ error: 'Taboo check failed', reason: taboo.reason });
      return;
    }

    try {
      const sb = getServiceClient();
      const { data, error } = await sb
        .from('connected_services')
        .insert({
          name: body.name,
          category: body.category ?? null,
          status: body.status ?? 'unknown',
          monthly_cost_usd: body.monthly_cost_usd ?? null,
          last_billed_at: body.last_billed_at ?? null,
          config_url: body.config_url ?? null,
          notes: body.notes ?? null,
          owner_team_member_id: body.owner_team_member_id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      await auditLog('insert', { service_id: data.id, name: body.name });
      res.status(201).json({ service: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
