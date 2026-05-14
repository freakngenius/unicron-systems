// POST /api/atrium/agents/run/analyst-daily-digest
//
// Manually trigger the Analyst dailyDigest job. Body: { for_date?: 'YYYY-MM-DD' }.
// Defaults to yesterday (server UTC). Returns the vault path written + counts.
//
// Used for:
//   - Sprint 7.5 Symptom 1 smoke: trigger after-hours, verify file at
//     wiki/memory/analyst/<for_date>.md, UI surfaces it.
//   - Manual catch-up on days the cron missed.
//
// Refusal layer: every dailyDigest run logs to audit_log via
// ns_audit_log_append. The write to GitHub vault is the canonical sink.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const forDateRaw = body['for_date'];
  let forDate: string | undefined;
  if (typeof forDateRaw === 'string' && forDateRaw.length > 0) {
    if (!DATE_RE.test(forDateRaw)) {
      res.status(400).json({ ok: false, error: 'for_date must be YYYY-MM-DD' });
      return;
    }
    forDate = forDateRaw;
  }

  try {
    const { dailyDigest } = await import('../../../../lib/agents/analyst.js');
    const result = await dailyDigest({ forDate });

    // Write an audit_log row so this manual trigger is traceable.
    try {
      const sb = getServiceClient();
      await sb.rpc('ns_audit_log_append', {
        p_table_name: 'sprint_7_5',
        p_action: 'analyst_daily_digest_manual_run',
        p_actor_id: null,
        p_payload: result as unknown as Record<string, unknown>,
      });
    } catch (auditErr) {
      // Fall back to a direct INSERT — if even that fails, surface but don't
      // mask the dailyDigest success.
      try {
        const sb = getServiceClient();
        await sb.schema('nervous_system').from('audit_log').insert({
          table_name: 'sprint_7_5',
          action: 'analyst_daily_digest_manual_run',
          payload: result,
        });
      } catch (fallbackErr) {
        console.warn('[analyst-daily-digest run] audit_log writeback failed:', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
        void auditErr;
      }
    }

    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
