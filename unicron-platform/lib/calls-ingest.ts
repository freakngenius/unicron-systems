// lib/calls-ingest.ts
//
// Shared call-transcript ingestion helper. Used by:
//   - api/atrium/calls/upload.ts        — manual upload from Atrium Work > Calls (C3)
//   - api/inbound/fathom/calls.ts       — Fathom recording.completed webhook   (C5b)
//   - api/inbound/zoom/calls.ts         — Zoom recording.completed webhook     (C5c)
//   - api/inbound/plaud/calls.ts        — placeholder; Plaud has no public API (C5a)
//
// Wraps two operations as one transaction-shaped flow:
//   1. createCallTranscriptPage from lib/notion-call-transcripts → Notion page
//   2. public.ns_create_call_transcript_ledger_row RPC → nervous_system.ledger row
//
// Failure modes:
//   - Notion failure → throws; ledger row not written (clean retry state)
//   - Ledger failure → return value carries ledger_error + the Notion URL so
//     the caller can decide to surface 207 (manual upload) or 500 (auto-ingest)

import { createClient } from '@supabase/supabase-js';
import { inngest } from './inngest/client.js';
import {
  createCallTranscriptPage,
  type CallTranscriptPayload,
} from './notion-call-transcripts.js';

export interface IngestResult {
  notion_page_id: string;
  notion_url: string;
  ledger_id: string | null;
  ledger_error: string | null;
  /**
   * Bug 1 of the Atrium blockers goal (2026-05-13): every successful ledger
   * insert creates a `nervous_system.call_processing_jobs` row in 'queued'
   * status. The UI polls this job (status: queued → processing → complete/failed)
   * instead of inferring 'done' from audit_log. NULL when the ledger insert
   * failed (no parent row to attach a job to).
   */
  processing_job_id: string | null;
}

function makeServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env vars not configured');
  return createClient(url, key);
}

export async function ingestCallTranscript(
  payload: CallTranscriptPayload,
  uploadedBy: string,
): Promise<IngestResult> {
  const notion = await createCallTranscriptPage(payload);

  const summaryForLedger =
    payload.summary_notes ??
    payload.transcript?.slice(0, 240) ??
    `Call ingested ${payload.date ?? new Date().toISOString().slice(0, 10)}`;

  const sb = makeServiceSupabase();
  const { data: ledgerId, error: ledgerErr } = await sb.rpc('ns_create_call_transcript_ledger_row', {
    p_title:          payload.title ?? null,
    p_summary:        summaryForLedger,
    p_content_full:   payload.transcript ?? payload.summary_notes ?? '',
    p_participants:   payload.participants ?? [],
    p_notion_page_id: notion.notion_page_id,
    p_notion_url:     notion.notion_url,
    p_source:         payload.source ?? 'manual_upload',
    p_call_date:      payload.date ?? null,
    p_uploaded_by:    uploadedBy,
  });

  const result: IngestResult = {
    notion_page_id: notion.notion_page_id,
    notion_url: notion.notion_url,
    ledger_id: (ledgerId as string | null) ?? null,
    ledger_error: ledgerErr?.message ?? null,
    processing_job_id: null,
  };

  // Bug 1: create a processing job row BEFORE firing Inngest so the UI has
  // something to poll. We only do this when the ledger insert succeeded —
  // the table has a FK to nervous_system.ledger(id).
  if (!ledgerErr && result.ledger_id) {
    try {
      const { data: jobId, error: jobErr } = await sb.rpc('ns_create_call_processing_job', {
        p_call_id: result.ledger_id,
      });
      if (jobErr) {
        console.warn('[calls-ingest] ns_create_call_processing_job failed:', jobErr.message);
      } else if (typeof jobId === 'string') {
        result.processing_job_id = jobId;
      }
    } catch (err) {
      console.warn('[calls-ingest] ns_create_call_processing_job threw:', err instanceof Error ? err.message : err);
    }
  }

  // Fire downstream event for C6 action-item extraction. Best-effort: a send
  // failure (no INNGEST_EVENT_KEY, etc.) must not break ingestion. The Inngest
  // function (extractCallActionItemsRun) listens on `call/transcript.uploaded`
  // and runs the LLM extraction asynchronously.
  if (!ledgerErr && result.ledger_id) {
    try {
      await inngest.send({
        name: 'call/transcript.uploaded',
        data: {
          call_id:             result.ledger_id,
          call_notion_page_id: result.notion_page_id,
          call_notion_url:     result.notion_url,
          call_title:          payload.title ?? null,
          participants:        payload.participants ?? [],
          transcript_text:     [payload.summary_notes, payload.transcript].filter(Boolean).join('\n\n').slice(0, 50000),
          source:              payload.source ?? 'manual_upload',
          uploaded_by:         uploadedBy,
          processing_job_id:   result.processing_job_id,
        },
      });
    } catch (err) {
      // Non-fatal — log to console for observability but don't error the call.
      // If the job was created but the event never reached Inngest, the job
      // sticks at 'queued' and the UI surfaces a clear timeout instead of
      // spinning forever with no signal.
      console.warn('[calls-ingest] inngest.send failed:', err instanceof Error ? err.message : err);
    }
  }

  return result;
}
