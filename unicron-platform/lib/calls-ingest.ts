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
import {
  createCallTranscriptPage,
  type CallTranscriptPayload,
} from './notion-call-transcripts.js';

export interface IngestResult {
  notion_page_id: string;
  notion_url: string;
  ledger_id: string | null;
  ledger_error: string | null;
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

  return {
    notion_page_id: notion.notion_page_id,
    notion_url: notion.notion_url,
    ledger_id: (ledgerId as string | null) ?? null,
    ledger_error: ledgerErr?.message ?? null,
  };
}
