// app/api/ingest/route.ts — Sprint 1 Stream C
//
// Real ingest handler. Replaces the Sprint 0 echo stub.
//
// Auth: x-unicron-api-key header must match UNICRON_INGEST_API_KEY env var.
// Input: Zod-validated JSON body with source_type discriminator.
//
// STREAM B DEPENDENCY:
//   Imports below marked [STREAM-B] come from lib/ingest/__stubs.ts during
//   development. After sprint/1-ingest merges, delete __stubs.ts and remap
//   these imports to their real paths:
//     runIngestCall  → @/lib/ingest/skills/ingest-call
//     checkTaboo     → @/lib/taboo-keeper
//     writeIngestRecords → @/lib/ingest/base

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// [STREAM-B] Replace with real imports after sprint/1-ingest merges:
//   import { runIngestCall, type IngestCallInput } from '@/lib/ingest/skills/ingest-call';
//   import { checkTaboo } from '@/lib/taboo-keeper';
//   import { writeIngestRecords } from '@/lib/ingest/base';
import {
  runIngestCall,
  checkTaboo,
  writeIngestRecords,
  type IngestCallInput,
  type IngestCallResult,
  type TabooVerdict,
} from '@/lib/ingest/__stubs';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const participantSchema = z.object({
  team_member_id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});

const capturedBySchema = z.object({
  type: z.enum(['human', 'agent']),
  id: z.string().uuid(),
});

const metadataSchema = z.record(z.unknown()).optional();

const callPayloadSchema = z.object({
  source_type: z.literal('call'),
  source_id: z.string(),
  source_url: z.string().nullable(),
  raw_content: z.string().min(1),
  participants: z.array(participantSchema),
  captured_at: z.string().datetime(),
  captured_by: capturedBySchema,
  metadata: metadataSchema,
});

const otherPayloadSchema = z.object({
  source_type: z.enum(['slack', 'email', 'voice_memo', 'apple_note', 'manual']),
  source_id: z.string(),
  source_url: z.string().nullable(),
  raw_content: z.string().min(1),
  participants: z.array(participantSchema),
  captured_at: z.string().datetime(),
  captured_by: capturedBySchema,
  metadata: metadataSchema,
});

const ingestPayloadSchema = z.discriminatedUnion('source_type', [
  callPayloadSchema,
  otherPayloadSchema,
]);

type IngestPayload = z.infer<typeof ingestPayloadSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Write a row to the nervous_system.audit_log table via a direct Supabase
 * REST call. Best-effort: failures are logged but never propagate to callers.
 */
async function auditLog(
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[ingest] audit_log skipped — missing Supabase env vars');
    return;
  }
  try {
    await fetch(`${url}/rest/v1/audit_log?schema=nervous_system`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        // Notify PostgREST we want the nervous_system schema
        'Accept-Profile': 'nervous_system',
        'Content-Profile': 'nervous_system',
      },
      body: JSON.stringify({
        table_name: 'ingest',
        action,
        actor_id: '9696088f-b3c5-4536-a4c6-c7a40312ad6b', // system actor
        payload: { ...payload, _written_by: 'api/ingest route.ts' },
      }),
    });
  } catch (err) {
    console.error('[ingest] audit_log write failed (best-effort)', err);
  }
}

/**
 * Post a message to #orchestrator-escalations when a Taboo Keeper bounce
 * occurs. Sprint 2 will wire this properly via the Slack connector framework.
 * For now: best-effort post if SLACK_BOT_TOKEN + SLACK_ESCALATION_CHANNEL_ID
 * are set; otherwise log only.
 */
async function notifyEscalation(
  reason: string,
  matched_taboo: string,
  source_id: string,
  source_type: string,
): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_ESCALATION_CHANNEL_ID ?? 'orchestrator-escalations';
  if (!token) {
    console.warn('[ingest] Taboo bounce escalation not posted — SLACK_BOT_TOKEN not set', {
      reason,
      matched_taboo,
      source_id,
      source_type,
    });
    return;
  }
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel,
        text: `*Ingest Bounce* — Taboo Keeper blocked a write.\n*Source:* \`${source_type}/${source_id}\`\n*Reason:* ${reason}\n*Matched taboo:* \`${matched_taboo}\``,
      }),
    });
  } catch (err) {
    console.error('[ingest] Slack escalation post failed (best-effort)', err);
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const apiKey = req.headers.get('x-unicron-api-key');
  if (!apiKey || apiKey !== process.env.UNICRON_INGEST_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data: IngestPayload = parsed.data;
  const { source_type, source_id } = data;

  // ── Dispatch by source_type ───────────────────────────────────────────────

  if (source_type === 'call') {
    const input: IngestCallInput = {
      source_id,
      source_url: data.source_url,
      raw_content: data.raw_content,
      participants: data.participants,
      captured_at: data.captured_at,
      captured_by: data.captured_by,
      metadata: data.metadata,
    };

    let result: IngestCallResult;
    try {
      result = await runIngestCall(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ingest] runIngestCall threw', { source_id, err: msg });
      await auditLog('ingest_call_error', { source_id, error: msg });
      return NextResponse.json({ error: 'Ingest skill failed', detail: msg }, { status: 500 });
    }

    // NO_SIGNAL or ABSTAIN — log and return
    if (result.status === 'NO_SIGNAL' || result.status === 'ABSTAIN') {
      await auditLog(`ingest_${result.status.toLowerCase()}`, {
        source_id,
        source_type,
        reason: result.reason,
      });
      return NextResponse.json({ status: result.status, reason: result.reason });
    }

    // records path — Taboo Keeper validation
    const tabooTargets: Array<{ subject: unknown; context: string }> = [
      { subject: result.ledger_row, context: 'ledger_row' },
      { subject: result.vault_doc, context: 'vault_doc' },
      ...result.action_items.map((ai, i) => ({ subject: ai, context: `action_item[${i}]` })),
    ];

    for (const { subject, context } of tabooTargets) {
      let verdict: TabooVerdict;
      try {
        verdict = await checkTaboo(subject, context);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ingest] checkTaboo threw', { source_id, context, err: msg });
        await auditLog('ingest_taboo_error', { source_id, context, error: msg });
        return NextResponse.json(
          { error: 'Taboo Keeper check failed', detail: msg },
          { status: 500 },
        );
      }

      if (verdict.verdict === 'bounce') {
        await auditLog('ingest_taboo_bounce', {
          source_id,
          source_type,
          context,
          reason: verdict.reason,
          matched_taboo: verdict.matched_taboo,
        });
        await notifyEscalation(verdict.reason, verdict.matched_taboo, source_id, source_type);
        return NextResponse.json({
          status: 'bounced',
          reason: verdict.reason,
          matched_taboo: verdict.matched_taboo,
        });
      }
    }

    // All passed — write records
    let written: Awaited<ReturnType<typeof writeIngestRecords>>;
    try {
      written = await writeIngestRecords(result as Extract<IngestCallResult, { status: 'records' }>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ingest] writeIngestRecords threw', { source_id, err: msg });
      await auditLog('ingest_write_error', { source_id, error: msg });
      return NextResponse.json({ error: 'Write failed', detail: msg }, { status: 500 });
    }

    await auditLog('ingest_records_written', {
      source_id,
      source_type,
      ledger_id: written.ledger_id,
      vault_doc_path: written.vault_doc_path,
      action_item_count: written.action_item_ids.length,
    });

    return NextResponse.json({
      status: 'records',
      ledger_id: written.ledger_id,
      vault_doc_path: written.vault_doc_path,
      action_item_ids: written.action_item_ids,
    });
  }

  // ── Unimplemented source types ─────────────────────────────────────────────
  await auditLog('ingest_source_not_implemented', { source_id, source_type });
  console.log(`[ingest] source_type ${source_type} not yet implemented`);
  return NextResponse.json(
    {
      status: 'pending',
      note: `Source type ${source_type} not yet implemented. Sprint 2+ will add.`,
    },
    { status: 202 },
  );
}
