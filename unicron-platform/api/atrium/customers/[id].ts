// api/atrium/customers/[id].ts — Sprint 5 Stream E
// PATCH /api/atrium/customers/:id — update status/notes/primary_contact
//
// Flow:
//   1. Validate request
//   2. Taboo check — inline vault fetch from unicron-knowledge/wiki/memory/taboos.md
//   3. Load current row via ns_get_customer (before_state)
//   4. Apply update via ns_update_customer RPC (public schema, SECURITY DEFINER)
//   5. Write audit signal via ns_append_ledger_signal
//   6. Return updated customer
//
// Uses public-schema RPCs to avoid PGRST106 (nervous_system not in PostgREST whitelist).

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

type PatchBody = {
  status?: string;
  notes?: string | null;
  primary_contact?: string | null; // uuid of team member, or explicit null to clear
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Extract :id from path params (Vercel sets req.query for dynamic segments)
  const id =
    typeof req.query?.id === 'string'
      ? req.query.id
      : Array.isArray(req.query?.id)
        ? req.query.id[0]
        : null;

  if (!id) {
    res.status(400).json({ error: 'Missing customer id' });
    return;
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const body = req.body as PatchBody | undefined;
  const { status, notes, primary_contact } = body ?? {};

  if (status === undefined && notes === undefined && primary_contact === undefined) {
    res.status(400).json({
      error: 'At least one field (status, notes, primary_contact) is required',
    });
    return;
  }

  // Taboo check — scan free-text fields for vault taboo phrases
  const tabooText = [status ?? '', typeof notes === 'string' ? notes : ''].join(' ');
  const taboo = await tabooCheck(tabooText);
  if (taboo.blocked) {
    res.status(403).json({ error: 'Taboo check blocked this action', reason: taboo.reason });
    return;
  }

  try {
    const sb = getServiceClient();

    // Fetch before-state
    const { data: existingRows, error: fetchErr } = await sb.rpc('ns_get_customer', {
      p_id: id,
    });
    if (fetchErr) throw fetchErr;
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
    if (!existing) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    const beforeState = existing as CustomerRow;

    // Build RPC params — distinguish "not provided" from "explicitly set to null"
    // notes: null means clear it; undefined means leave alone
    // primary_contact: null means clear it; undefined means leave alone
    const rpcParams: Record<string, unknown> = { p_id: id };
    // Status canon is lowercase (matches customers_status_check). UI sends
    // title-cased labels for display; normalize at the boundary.
    if (status !== undefined) rpcParams.p_status = status.toLowerCase();
    if (notes !== undefined) {
      if (notes === null) {
        rpcParams.p_clear_notes = true;
      } else {
        rpcParams.p_notes = notes;
      }
    }
    if (primary_contact !== undefined) {
      if (primary_contact === null) {
        rpcParams.p_clear_contact = true;
      } else {
        rpcParams.p_primary_contact = primary_contact;
      }
    }

    const { data: updatedRows, error: updateErr } = await sb.rpc(
      'ns_update_customer',
      rpcParams,
    );
    if (updateErr) throw updateErr;
    const updated = (
      Array.isArray(updatedRows) ? updatedRows[0] : updatedRows
    ) as CustomerRow | null;

    if (!updated) {
      res.status(404).json({ error: 'Customer not found or update produced no result' });
      return;
    }

    // Audit log via ledger signal — non-blocking
    (async () => {
      try {
        await sb.rpc('ns_append_ledger_signal', {
          p_source_type: 'atrium_ui',
          p_source_id: id,
          p_summary: 'update_customer',
          p_insights: { before_state: beforeState, after_state: updated },
        });
      } catch {
        // Non-fatal
      }
    })();

    res.status(200).json(updated);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object'
          ? JSON.stringify(err)
          : String(err);
    res.status(500).json({ error: msg });
  }
}
