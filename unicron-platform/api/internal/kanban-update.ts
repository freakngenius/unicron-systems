// api/internal/kanban-update.ts
//
// POST: drag-and-drop write path for the Atrium Work > Kanban surface.
//   body: { notion_page_id: string, status: string, allow_verified?: boolean,
//           workspace?: string }
//   Calls notionKanbanPush which (1) PATCHes the Notion page Status, (2)
//   upserts the local mirror, (3) writes an audit_log row. The Verified
//   column is refused unless allow_verified=true is supplied by the UI
//   confirmation modal (HARD CONSTRAINT 3 — human-only).
//
// GET ?op=pull[&workspace=internal]: triggers a fresh pull from Notion.
//   Used by the Atrium tab on mount so the kanban is current the moment the
//   operator opens it, without waiting for the next cron tick.
//
// Auth: every call requires Authorization: Bearer <supabase-access-token>.
// The token is resolved against Supabase auth.getUser; the resolved email
// must be on the Atrium operator allowlist (ATRIUM_EMAIL_ALLOWLIST env, comma-
// separated). Verified-column writes additionally require the caller's email
// to appear on the founder list (ATRIUM_VERIFIED_ALLOWLIST env). Without
// either env, the handler refuses every request — fail-closed.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function readJsonBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
  }
  if (typeof body === 'object') return body as Record<string, unknown>;
  return {};
}

function parseAllowlist(envValue: string | undefined): string[] {
  if (!envValue) return [];
  return envValue
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function authorize(req: VercelRequest): Promise<
  | { ok: true; email: string }
  | { ok: false; status: number; error: string }
> {
  const operatorAllowlist = parseAllowlist(process.env.ATRIUM_EMAIL_ALLOWLIST);
  if (operatorAllowlist.length === 0) {
    return { ok: false, status: 500, error: 'ATRIUM_EMAIL_ALLOWLIST not configured — refusing all writes' };
  }

  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string' || !authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'missing bearer token' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, status: 401, error: 'empty bearer token' };

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: 'supabase url/anon key not configured' };
  }

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.email) {
    return { ok: false, status: 401, error: 'invalid bearer token' };
  }

  const email = data.user.email.toLowerCase();
  if (!operatorAllowlist.includes(email)) {
    return { ok: false, status: 403, error: 'caller not on Atrium operator allowlist' };
  }
  return { ok: true, email };
}

function callerCanVerify(email: string): boolean {
  const founderAllowlist = parseAllowlist(process.env.ATRIUM_VERIFIED_ALLOWLIST);
  if (founderAllowlist.length === 0) return false; // fail-closed
  return founderAllowlist.includes(email.toLowerCase());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await authorize(req);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }

    if (req.method === 'GET') {
      const op = (req.query.op as string | undefined) ?? '';
      if (op !== 'pull') {
        res.status(400).json({ ok: false, error: 'unknown op' });
        return;
      }
      const workspace = (req.query.workspace as string | undefined) ?? 'internal';
      const { notionKanbanPull } = await import('../../lib/agents/notion-kanban-sync.js');
      const result = await notionKanbanPull(workspace, 'atrium_mount');
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method not allowed' });
      return;
    }

    const body = readJsonBody(req);
    const notionPageId = typeof body.notion_page_id === 'string' ? body.notion_page_id : null;
    const status = typeof body.status === 'string' ? body.status : null;
    const requestedVerified = body.allow_verified === true;
    const workspace = typeof body.workspace === 'string' ? body.workspace : 'internal';

    if (!notionPageId || !status) {
      res.status(400).json({ ok: false, error: 'notion_page_id and status required' });
      return;
    }

    // Verified writes require both the UI confirmation flag AND a founder-tier
    // caller. Anyone reaching the endpoint with a non-founder token cannot
    // promote to Verified even if they send allow_verified=true.
    let allowVerified = false;
    if (requestedVerified) {
      if (!callerCanVerify(auth.email)) {
        res.status(403).json({
          ok: false,
          error: 'Verified promotion requires a founder-tier caller (HARD CONSTRAINT 3)',
        });
        return;
      }
      allowVerified = true;
    }

    const { notionKanbanPush } = await import('../../lib/agents/notion-kanban-sync.js');
    const result = await notionKanbanPush({
      notion_page_id: notionPageId,
      status,
      workspace,
      allow_verified: allowVerified,
    });

    if (!result.ok) {
      res.status(result.error?.includes('human-only') ? 403 : 502).json(result);
      return;
    }

    res.status(200).json({ ...result, actor_email: auth.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
}
