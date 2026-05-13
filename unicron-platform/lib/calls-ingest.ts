// lib/calls-ingest.ts
//
// Shared call-transcript ingestion helper. Used by:
//   - api/atrium/calls/upload.ts        — manual upload from Atrium Work > Calls
//   - api/inbound/fathom/calls.ts       — Fathom recording.completed webhook
//   - api/inbound/zoom/calls.ts         — Zoom recording.completed webhook
//   - api/inbound/plaud/calls.ts        — placeholder; Plaud has no public API
//
// Two entry points:
//
//   ingestCallTranscript(payload, uploadedBy)
//     Notion write + ledger row + best-effort Inngest event for async
//     transcript fan-out. Webhooks use this — they want to return 200 fast
//     and let extractCallActionItemsRun do the work later.
//
//   processCallUpload(payload, uploadedBy)
//     Wraps ingestCallTranscript and ALSO runs runActionItemExtraction
//     synchronously so the API response carries the extracted counts. The
//     Atrium upload modal uses this — operators see "Processed: N action
//     items, M decisions, K customer mentions" in the success view.
//
// Both paths fire the Inngest event as a retry-safety net; the sync extractor
// is best-effort and any failure is captured in the response under `errors`
// without rolling back the Notion + ledger writes.

import { createClient } from '@supabase/supabase-js';
import { inngest } from './inngest/client.js';
import {
  createCallTranscriptPage,
  type CallTranscriptPayload,
} from './notion-call-transcripts.js';
import { runActionItemExtraction, type FlowResult } from './calls-action-item-flow.js';

export interface IngestResult {
  notion_page_id: string;
  notion_url: string;
  ledger_id: string | null;
  ledger_error: string | null;
}

export interface ProcessResult extends IngestResult {
  extraction: FlowResult | null;       // null when ledger failed (extraction never ran)
  extraction_error: string | null;     // top-level error if the extractor threw
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
  };

  // Fire downstream event for the async Inngest extractor. Best-effort —
  // an inngest.send failure (no INNGEST_EVENT_KEY, etc.) must not break
  // ingestion. The sync extractor in processCallUpload is the primary path
  // for the Atrium upload modal; this event is the retry/redundancy hook
  // and remains the only fan-out trigger for the webhook callers.
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
        },
      });
    } catch (err) {
      console.warn('[calls-ingest] inngest.send failed:', err instanceof Error ? err.message : err);
    }
  }

  return result;
}

export async function processCallUpload(
  payload: CallTranscriptPayload,
  uploadedBy: string,
): Promise<ProcessResult> {
  const ingest = await ingestCallTranscript(payload, uploadedBy);

  if (ingest.ledger_error || !ingest.ledger_id) {
    return {
      ...ingest,
      extraction: null,
      extraction_error: null,
    };
  }

  const transcriptText = [payload.summary_notes, payload.transcript]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 50000);

  if (!transcriptText.trim()) {
    return {
      ...ingest,
      extraction: {
        extracted_counts: { action_items: 0, decisions: 0, customer_mentions: 0 },
        written_action_items: [],
        written_decisions: [],
        customer_mentions_result: {
          resolved: [],
          unresolved: [],
          dominant_customer_id: null,
          dominant_customer_name: null,
          count_resolved: 0,
          count_unresolved: 0,
        },
        errors: [],
        skipped_reason: 'empty transcript_text',
      },
      extraction_error: null,
    };
  }

  try {
    const extraction = await runActionItemExtraction({
      call_id:             ingest.ledger_id,
      call_notion_page_id: ingest.notion_page_id,
      call_notion_url:     ingest.notion_url,
      call_title:          payload.title ?? null,
      transcript_text:     transcriptText,
      participants:        payload.participants ?? [],
      uploaded_by:         uploadedBy,
    });
    return { ...ingest, extraction, extraction_error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown extractor failure';
    console.warn('[calls-ingest] runActionItemExtraction failed:', message);
    return { ...ingest, extraction: null, extraction_error: message };
  }
}
