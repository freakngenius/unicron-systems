/**
 * Shared logic for reconciling Vapi cost data onto voice_call_transcripts.
 * Used by:
 *   - POST /api/voice/reconcile-costs (manual + UI button)
 *   - GET  /api/cron/voice/reconcile-costs (scheduled, daily)
 *
 * Idempotent: only touches rows that have a vapi_call_id and are missing cost_usd
 * (or rows explicitly listed in transcript_ids).
 *
 * Translated from prototype src/lib/reconcileVapiCosts.ts. Atrium consumes the
 * service-role supabase client via api/_lib/supabaseAdmin (pinned to the
 * pathfinder schema) instead of the prototype's module-level supabaseAdmin
 * singleton, so the caller is responsible for passing a SupabaseClient in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getVapiCall } from './vapi.js';

export type ReconcileOptions = {
  max?: number;
  transcript_ids?: string[];
  concurrency?: number;
};

export type ReconcileResult = {
  ok: boolean;
  candidates: number;
  reconciled: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
};

export async function reconcileVapiCosts(
  supabase: SupabaseClient,
  apiKey: string,
  opts: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const max = Math.min(Number(opts.max ?? 50), 200);
  const explicit =
    Array.isArray(opts.transcript_ids) && opts.transcript_ids.length > 0
      ? opts.transcript_ids
      : null;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 5, 10));

  let q = supabase
    .from('voice_call_transcripts')
    .select('id, vapi_call_id, cost_usd, vapi_org_id, ended_at, ended_reason')
    .not('vapi_call_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(max);

  if (explicit) {
    q = q.in('id', explicit);
  } else {
    q = q.is('cost_usd', null);
  }

  const { data: rows, error } = await q;
  if (error) {
    return {
      ok: false,
      candidates: 0,
      reconciled: 0,
      failed: 0,
      errors: [{ id: 'query', error: error.message }],
    };
  }
  if (!rows || rows.length === 0) {
    return { ok: true, candidates: 0, reconciled: 0, failed: 0, errors: [] };
  }

  let reconciled = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (row: Record<string, unknown>) => {
        const vapiCallId = row.vapi_call_id as string | null;
        const rowId = row.id as string;
        if (!vapiCallId) return;
        const r = await getVapiCall(apiKey, vapiCallId);
        if (!r.ok || !r.body) {
          failed++;
          errors.push({ id: rowId, error: `vapi ${r.status}` });
          return;
        }
        const v = r.body as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        if (typeof v.cost === 'number') updates.cost_usd = v.cost;
        if (v.costBreakdown) updates.cost_breakdown = v.costBreakdown;
        if (typeof v.orgId === 'string') updates.vapi_org_id = v.orgId;
        if (typeof v.startedAt === 'string') updates.started_at = v.startedAt;
        if (typeof v.endedAt === 'string' && !row.ended_at) updates.ended_at = v.endedAt;
        if (typeof v.endedReason === 'string' && !row.ended_reason) {
          updates.ended_reason = v.endedReason;
        }
        if (Object.keys(updates).length === 0) return;
        const { error: upErr } = await supabase
          .from('voice_call_transcripts')
          .update(updates)
          .eq('id', rowId);
        if (upErr) {
          failed++;
          errors.push({ id: rowId, error: upErr.message });
        } else {
          reconciled++;
        }
      })
    );
  }

  return {
    ok: true,
    candidates: rows.length,
    reconciled,
    failed,
    errors: errors.slice(0, 20),
  };
}
