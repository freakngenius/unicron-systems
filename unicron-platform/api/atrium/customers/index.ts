// api/atrium/customers/index.ts — Sprint 5 Stream E
// GET  /api/atrium/customers — list nervous_system.customers (optional ?status= filter)
// POST /api/atrium/customers — create a new customer (taboo-checked, audit-logged)
//
// Uses public-schema RPCs (ns_list_customers, ns_create_customer) with SECURITY DEFINER
// to access nervous_system without exposing the schema through PostgREST.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

interface CustomerRow {
  id: string;
  name: string;
  status: string;
  primary_contact_team_member_id: string | null;
  notes: string | null;
  metadata: unknown | null;
  created_at: string;
  last_touched: string | null;
  ttl_days: number | null;
}

type PostBody = {
  name?: string;
  status?: string;
  primary_contact?: string; // uuid of team member, or null
  notes?: string;
  metadata?: unknown;
  ttl_days?: number;
};

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

async function writeAuditLog(
  action: string,
  entityId: string,
  afterState: unknown,
): Promise<void> {
  try {
    const sb = getServiceClient();
    await sb.rpc('ns_append_ledger_signal', {
      p_source_type: 'atrium_ui',
      p_source_id: entityId,
      p_summary: action,
      p_insights: { after_state: afterState },
    });
  } catch {
    // Non-fatal
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // ─── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const statusFilter =
      typeof req.query?.status === 'string' ? req.query.status : null;

    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_list_customers', {
        p_status: statusFilter,
        p_limit: 100,
      });
      if (error) throw error;
      res.status(200).json(data ?? []);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object'
            ? JSON.stringify(err)
            : String(err);
      // Table may not exist yet — return empty array so UI shows placeholder
      if (msg.includes('does not exist') || msg.includes('42P01')) {
        res.status(200).json([]);
        return;
      }
      res.status(500).json({ error: msg });
    }
    return;
  }

  // ─── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as PostBody | undefined;

    if (!body?.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const taboo = await tabooCheck(body.name);
    if (taboo.blocked) {
      res.status(403).json({ error: 'Taboo check blocked this action', reason: taboo.reason });
      return;
    }

    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_create_customer', {
        p_name: body.name,
        p_status: body.status ?? 'Cold',
        p_primary_contact: body.primary_contact ?? null,
        p_notes: body.notes ?? null,
        p_metadata: body.metadata ?? null,
        p_ttl_days: body.ttl_days ?? 90,
      });
      if (error) throw error;
      const created = (Array.isArray(data) ? data[0] : data) as CustomerRow;
      await writeAuditLog('create_customer', created.id, created);
      res.status(201).json(created);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object'
            ? JSON.stringify(err)
            : String(err);
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
