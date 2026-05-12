// api/atrium/calls/upload.ts — Stream C3 of the Calls Ingestion sprint.
//
// POST /api/atrium/calls/upload
//
// Body: {
//   transcript?: string,          // full transcript text
//   summary_notes?: string,       // shorthand notes; at least one of these two is required
//   date?: string,                // ISO date, defaults to today
//   participants?: string[],      // mix of canonical team names + free-text externals
//   title?: string,               // optional override; defaults to "[participants] — [date]"
//   key_takeaways?: string,
//   insights?: string,
//   source?: 'manual_upload' | 'plaud' | 'fathom' | 'zoom'
// }
//
// Flow:
//   1. authorize() — bearer token must resolve to an email on ATRIUM_EMAIL_ALLOWLIST.
//   2. createCallTranscriptPage() — Notion write.
//   3. ns_create_call_transcript_ledger_row RPC — local ledger row so the
//      Atrium Work > Calls tab picks the call up immediately.
//   4. (deferred to C6) Inngest event 'call.transcript.uploaded' fires the
//      transcript skill STEP 2 + STEP 3.
//
// Response: { ok: true, notion_page_id, notion_url, ledger_id } on success,
// { ok: false, error } on failure. If Notion succeeds but the ledger insert
// fails, the response includes both notion_url and the ledger error so the
// operator can still find the call in Notion.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  createCallTranscriptPage,
  type CallTranscriptPayload,
} from '../../../lib/notion-call-transcripts.js';

// ─── Auth (mirrors api/internal/kanban-update.ts) ─────────────────────────────

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

// ─── Body parsing + validation ────────────────────────────────────────────────

function readJsonBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
  }
  if (typeof body === 'object') return body as Record<string, unknown>;
  return {};
}

function asStringOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
}

const VALID_SOURCES = new Set(['manual_upload', 'plaud', 'fathom', 'zoom']);

interface ParsedUploadBody {
  transcript?: string;
  summary_notes?: string;
  date?: string;
  participants: string[];
  title?: string;
  key_takeaways?: string;
  insights?: string;
  source: CallTranscriptPayload['source'];
}

function parseUploadBody(body: Record<string, unknown>): ParsedUploadBody | { error: string } {
  const transcript = asStringOrUndef(body.transcript);
  const summary_notes = asStringOrUndef(body.summary_notes);
  if (!transcript && !summary_notes) {
    return { error: 'at least one of transcript or summary_notes is required' };
  }

  const dateRaw = asStringOrUndef(body.date);
  const date = dateRaw && /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : undefined;

  const rawSource = asStringOrUndef(body.source);
  const source: CallTranscriptPayload['source'] =
    rawSource && VALID_SOURCES.has(rawSource) ? (rawSource as CallTranscriptPayload['source']) : 'manual_upload';

  return {
    transcript,
    summary_notes,
    date,
    participants: asStringArray(body.participants),
    title: asStringOrUndef(body.title),
    key_takeaways: asStringOrUndef(body.key_takeaways),
    insights: asStringOrUndef(body.insights),
    source,
  };
}

// ─── Service supabase client ──────────────────────────────────────────────────

function makeServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env vars not configured');
  return createClient(url, key);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method not allowed' });
      return;
    }

    const auth = await authorize(req);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }

    const parsed = parseUploadBody(readJsonBody(req));
    if ('error' in parsed) {
      res.status(400).json({ ok: false, error: parsed.error });
      return;
    }

    // STEP 1 — Notion write (transcript skill STEP 1).
    const notion = await createCallTranscriptPage({
      title: parsed.title,
      date: parsed.date,
      participants: parsed.participants,
      transcript: parsed.transcript,
      summary_notes: parsed.summary_notes,
      key_takeaways: parsed.key_takeaways,
      insights: parsed.insights,
      source: parsed.source,
    });

    // Build a short summary to land in nervous_system.ledger.content_summary.
    const summaryForLedger =
      parsed.summary_notes ??
      parsed.transcript?.slice(0, 240) ??
      `Call uploaded ${parsed.date ?? new Date().toISOString().slice(0, 10)}`;

    const sb = makeServiceSupabase();
    const { data: ledgerId, error: ledgerErr } = await sb.rpc('ns_create_call_transcript_ledger_row', {
      p_title:          parsed.title ?? null,
      p_summary:        summaryForLedger,
      p_content_full:   parsed.transcript ?? parsed.summary_notes ?? '',
      p_participants:   parsed.participants,
      p_notion_page_id: notion.notion_page_id,
      p_notion_url:     notion.notion_url,
      p_source:         parsed.source ?? 'manual_upload',
      p_call_date:      parsed.date ?? null,
      p_uploaded_by:    auth.email,
    });

    if (ledgerErr) {
      // Notion succeeded; ledger failed. Surface both so the operator still has a link.
      res.status(207).json({
        ok: false,
        notion_page_id: notion.notion_page_id,
        notion_url:     notion.notion_url,
        ledger_error:   ledgerErr.message,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      notion_page_id: notion.notion_page_id,
      notion_url:     notion.notion_url,
      ledger_id:      ledgerId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upload failed';
    res.status(500).json({ ok: false, error: message });
  }
}

// Test-only exports
export const __internals = {
  authorize,
  parseUploadBody,
  readJsonBody,
};
