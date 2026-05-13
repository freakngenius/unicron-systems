// PATCH /api/atrium/agents/[id] — Sprint 7.5 Phase 1
// GET   /api/atrium/agents/[id] — single-agent read for the cockpit modal
//
// Editable fields: name, description, guiding_prompt, schedule_cron
// Refusal layer: every PATCH passes through Taboo Keeper before write.
// Cron is in advisory mode: persisted to nervous_system.agents but Inngest
// cron schedules are bound to deployed function definitions, so the modal
// renders a footnote that the new value goes live on next deploy.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_FIELDS = new Set(['name', 'description', 'guiding_prompt', 'schedule_cron']);

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const id = (req.query['id'] as string | undefined) ?? '';
  if (!UUID_RE.test(id)) {
    res.status(400).json({ ok: false, error: 'agent id must be a valid UUID' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const sb = getServiceClient();
      const { data, error } = await sb.rpc('ns_get_agent', { p_agent_id: id });
      if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { res.status(404).json({ ok: false, error: 'agent not found' }); return; }
      res.status(200).json({ ok: true, agent: row });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const actor_id = body['actor_id'];
    if (typeof actor_id !== 'string' || !UUID_RE.test(actor_id)) {
      res.status(400).json({ ok: false, error: 'actor_id (team_members uuid) is required' });
      return;
    }

    // Whitelist + shape-check the patch payload.
    const changes: Record<string, string> = {};
    for (const key of Object.keys(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue;
      const value = body[key];
      if (value === null || value === undefined) continue;
      if (typeof value !== 'string') {
        res.status(400).json({ ok: false, error: `${key} must be a string` });
        return;
      }
      changes[key] = value;
    }

    if (Object.keys(changes).length === 0) {
      res.status(400).json({ ok: false, error: 'no editable fields provided' });
      return;
    }

    if (typeof changes['name'] === 'string' && changes['name'].trim().length === 0) {
      res.status(400).json({ ok: false, error: 'name cannot be empty' });
      return;
    }

    try {
      const sb = getServiceClient();

      // HARD CONSTRAINT 2: refusal layer is primary.
      // Run the proposed mutation through the Taboo Keeper before writing.
      // RPC errors fail closed; no silent bypass.
      const tabooCheck = await sb.rpc('ns_check_taboo', {
        p_action: 'agent.cockpit.patch',
        p_target: id,
        p_actor: actor_id,
        p_context: JSON.stringify(changes),
      });

      if (tabooCheck.error) {
        res.status(500).json({
          ok: false,
          error: `Taboo Keeper unreachable; refusing to proceed: ${tabooCheck.error.message}`,
        });
        return;
      }

      const tabooResult = (tabooCheck.data ?? {}) as {
        blocked?: boolean;
        reason?: string;
        matched_rule?: string;
      };

      if (tabooResult.blocked === true) {
        const refusal = await sb.rpc('ns_log_agent_refusal', {
          p_agent_id: id,
          p_actor_id: actor_id,
          p_requested: changes,
          p_taboo_result: tabooResult,
        });
        res.status(422).json({
          ok: false,
          blocked: true,
          reason: tabooResult.reason ?? 'Taboo Keeper blocked this action',
          matched_rule: tabooResult.matched_rule ?? null,
          audit_log_id: refusal.data ?? null,
        });
        return;
      }

      const update = await sb.rpc('ns_update_agent', {
        p_agent_id: id,
        p_actor_id: actor_id,
        p_changes: changes,
        p_taboo_result: tabooResult,
      });

      if (update.error) {
        const msg = update.error.message ?? String(update.error);
        const status = msg.includes('not found') ? 404 : 500;
        res.status(status).json({ ok: false, error: msg });
        return;
      }

      const result = Array.isArray(update.data) ? update.data[0] : update.data;
      const cronAdvisory =
        typeof changes['schedule_cron'] === 'string'
          ? 'schedule_cron persisted to nervous_system.agents. Inngest cron schedules are bound to deployed function definitions — the new schedule goes live on next deploy.'
          : null;

      res.status(200).json({
        ok: true,
        agent: result?.updated_row ?? null,
        audit_log_id: result?.audit_log_id ?? null,
        cron_advisory: cronAdvisory,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
