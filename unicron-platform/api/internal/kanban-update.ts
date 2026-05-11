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

import type { VercelRequest, VercelResponse } from '@vercel/node';

function readJsonBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
  }
  if (typeof body === 'object') return body as Record<string, unknown>;
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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
    const allowVerified = body.allow_verified === true;
    const workspace = typeof body.workspace === 'string' ? body.workspace : 'internal';

    if (!notionPageId || !status) {
      res.status(400).json({ ok: false, error: 'notion_page_id and status required' });
      return;
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

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
}
