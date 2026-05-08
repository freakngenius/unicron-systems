// app/api/ingest/route.ts — Sprint 2 Stream D / Sprint 4 Stream A + Stream B
//
// Real ingest handler. Replaces the Sprint 0 echo stub.
// Sprint 2: adds routing for `manual` and `voice_memo` source types.
// Sprint 4 Stream A: multipart/form-data handling for voice_memo audio uploads.
// Sprint 4 Stream B: per-team-member API key lookup + `apple_note` routing.
//
// Auth:
//   1. Check x-unicron-api-key header.
//   2. Look up in nervous_system.team_members where config->>'ingest_api_key' matches.
//      If found, captured_by is overridden to that team_member's id.
//   3. Fall back to UNICRON_INGEST_API_KEY env var (shared key, backward compat).
//   4. Neither matches → 401.
//
// Input: Zod-validated JSON body with source_type discriminator.
//        For voice_memo: also accepts multipart/form-data with `audio` file field.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ingestCall, type IngestCallInput, type IngestCallResult } from '@/lib/ingest/skills/ingest-call';
import { ingestManual, type ManualIngestInput, type ManualIngestResult } from '@/lib/ingest/skills/ingest-manual';
import { ingestVoiceMemo, type VoiceMemoInput, type VoiceMemoResult } from '@/lib/ingest/skills/ingest-voice-memo';
import { ingestAppleNote, type AppleNoteIngestInput, type AppleNoteIngestResult } from '@/lib/ingest/skills/ingest-apple-note';

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

const manualPayloadSchema = z.object({
  source_type: z.literal('manual'),
  source_id: z.string(),
  source_url: z.string().nullable(),
  raw_content: z.string().min(1),
  participants: z.array(participantSchema),
  captured_at: z.string().datetime(),
  captured_by: capturedBySchema,
  metadata: metadataSchema,
});

// voice_memo allows empty raw_content (audio-only uploads have no transcript yet)
const voiceMemoPayloadSchema = z.object({
  source_type: z.literal('voice_memo'),
  source_id: z.string(),
  source_url: z.string().nullable(),
  raw_content: z.string().default(''), // empty string OK — audio-only path returns ABSTAIN
  audio_stored_url: z.string().optional(),
  participants: z.array(participantSchema),
  captured_at: z.string().datetime(),
  captured_by: capturedBySchema,
  metadata: metadataSchema,
});

const appleNotePayloadSchema = z.object({
  source_type: z.literal('apple_note'),
  source_id: z.string(),
  source_url: z.string().nullable(),
  raw_content: z.string().min(1),
  participants: z.array(participantSchema),
  captured_at: z.string().datetime(),
  captured_by: capturedBySchema,
  metadata: metadataSchema,
});

const otherPayloadSchema = z.object({
  source_type: z.enum(['slack', 'email']),
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
  manualPayloadSchema,
  voiceMemoPayloadSchema,
  appleNotePayloadSchema,
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

// ─── Per-team-member key lookup ───────────────────────────────────────────────

interface TeamMemberKeyMatch {
  id: string
  name: string
}

/**
 * Look up a team member by their ingest_api_key stored in config jsonb.
 * Uses the Supabase REST API with Accept-Profile: nervous_system.
 * Returns null if not found or if Supabase env vars are missing.
 */
async function lookupTeamMemberByKey(apiKey: string): Promise<TeamMemberKeyMatch | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  try {
    const encoded = encodeURIComponent(apiKey);
    const res = await fetch(
      `${url}/rest/v1/team_members?select=id,name&config->>ingest_api_key=eq.${encoded}&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Accept-Profile': 'nervous_system',
        },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as TeamMemberKeyMatch[];
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('[ingest] team_member key lookup failed (best-effort)', err);
    return null;
  }
}

// ─── Multipart voice memo helper ──────────────────────────────────────────────

/**
 * Parse a multipart/form-data voice_memo upload.
 * Extracts the audio file as a Buffer plus metadata fields.
 * Returns null if the request cannot be parsed.
 */
async function parseVoiceMemoMultipart(
  req: NextRequest,
): Promise<{ audioBuffer: Buffer; mimeType: string; fields: Record<string, string> } | null> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return null;
  }

  const audioEntry = formData.get('audio');
  if (!audioEntry || typeof audioEntry === 'string') {
    return null;
  }

  // audioEntry is a File or Blob (FormDataEntryValue that is not a string)
  const audioFileLike = audioEntry as unknown as { arrayBuffer(): Promise<ArrayBuffer>; type?: string };
  const arrayBuf = await audioFileLike.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuf);
  const mimeType = audioFileLike.type ?? 'audio/m4a';

  // Extract remaining string fields
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key !== 'audio' && typeof value === 'string') {
      fields[key] = value;
    }
  }

  return { audioBuffer, mimeType, fields };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  //
  // Priority:
  //   1. Per-team-member key from nervous_system.team_members.config->>'ingest_api_key'
  //      If found, captured_by is overridden to that team_member's id.
  //   2. Shared env var UNICRON_INGEST_API_KEY (backward compat).
  //   3. Neither → 401.
  //
  const apiKey = req.headers.get('x-unicron-api-key');
  if (!apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let capturedByOverride: { type: 'human'; id: string } | null = null;

  const teamMember = await lookupTeamMemberByKey(apiKey);
  if (teamMember) {
    // Per-member key matched — track who sent this
    capturedByOverride = { type: 'human', id: teamMember.id };
  } else if (apiKey !== process.env.UNICRON_INGEST_API_KEY) {
    // Not a per-member key, not the shared key → reject
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  // ── Multipart path: voice_memo audio upload ───────────────────────────────
  if (contentType.includes('multipart/form-data')) {
    const parsed = await parseVoiceMemoMultipart(req);
    if (!parsed) {
      return NextResponse.json({ error: 'Failed to parse multipart form data' }, { status: 400 });
    }

    const { audioBuffer, mimeType, fields } = parsed;

    // Validate required metadata fields
    const sourceId = fields['source_id'];
    const capturedAt = fields['captured_at'];
    const capturedByRaw = fields['captured_by'];

    if (!sourceId || !capturedAt || !capturedByRaw) {
      return NextResponse.json(
        { error: 'Multipart voice_memo upload requires source_id, captured_at, and captured_by fields' },
        { status: 400 },
      );
    }

    let capturedBy: { type: 'human' | 'agent'; id: string };
    try {
      capturedBy = JSON.parse(capturedByRaw) as { type: 'human' | 'agent'; id: string };
    } catch {
      return NextResponse.json({ error: 'captured_by must be valid JSON' }, { status: 400 });
    }

    const durationSeconds = fields['duration_seconds'] ? Number(fields['duration_seconds']) : undefined;

    const input: VoiceMemoInput = {
      source_type: 'voice_memo',
      source_id: sourceId,
      source_url: fields['source_url'] ?? null,
      raw_content: '',
      audio_buffer: audioBuffer,
      audio_stored_url: fields['audio_stored_url'],
      captured_at: capturedAt,
      captured_by: capturedBy,
      metadata: {
        mime_type: mimeType,
        duration_seconds: durationSeconds,
      },
    };

    let result: VoiceMemoResult;
    try {
      result = await ingestVoiceMemo(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ingest] ingestVoiceMemo (multipart) threw', { source_id: sourceId, err: msg });
      await auditLog('ingest_voice_memo_error', { source_id: sourceId, error: msg });
      return NextResponse.json({ error: 'Ingest skill failed', detail: msg }, { status: 500 });
    }

    if (result.status === 'ABSTAIN') {
      await auditLog('ingest_abstain', {
        source_id: sourceId,
        source_type: 'voice_memo',
        reason: result.reason,
        sprint_note: result.sprint_note,
      });
      return NextResponse.json({
        status: result.status,
        reason: result.reason,
        sprint_note: result.sprint_note,
      });
    }

    if (result.status === 'NO_SIGNAL') {
      await auditLog('ingest_no_signal', { source_id: sourceId, source_type: 'voice_memo', reason: result.reason });
      return NextResponse.json({ status: result.status, reason: result.reason });
    }

    const records = result as Extract<VoiceMemoResult, { status: 'records' }>;
    const vaultPath = `raw/inbox/voice-${capturedAt.split('T')[0]}-${sourceId.slice(0, 8)}.md`;

    await auditLog('ingest_records_written', {
      source_id: sourceId,
      source_type: 'voice_memo',
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_count: records.action_items.length,
    });

    return NextResponse.json({
      status: 'records',
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_ids: records.action_items.map((ai) => ai.id),
    });
  }

  // ── Parse JSON body (all other source types + JSON voice_memo) ────────────
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

  // Apply per-member key override: if the caller's key matched a team_member,
  // treat captured_by as that member (human), ignoring whatever was in the body.
  const effectiveCapturedBy = capturedByOverride ?? data.captured_by;

  // ── Dispatch by source_type ───────────────────────────────────────────────

  if (source_type === 'call') {
    const input: IngestCallInput = {
      source_type: 'call',
      source_id,
      source_url: data.source_url,
      raw_content: data.raw_content,
      participants: data.participants,
      captured_at: data.captured_at,
      captured_by: effectiveCapturedBy,
      metadata: data.metadata,
    };

    let result: IngestCallResult;
    try {
      result = await ingestCall(input);
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

    // records path — ingestCall handles writes + taboo internally
    // Sprint 2 TODO: expose a pre-write taboo gate in ingestCall so route can
    // bounce before any DB/vault write occurs.
    const records = result as Extract<IngestCallResult, { status: 'records' }>;
    const vaultPath = `Calls/${data.captured_at.split('T')[0]}-${source_id}.md`;

    await auditLog('ingest_records_written', {
      source_id,
      source_type,
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_count: records.action_items.length,
    });

    return NextResponse.json({
      status: 'records',
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_ids: records.action_items.map((ai) => ai.id),
    });
  }

  // ── manual ────────────────────────────────────────────────────────────────

  if (source_type === 'manual') {
    const input: ManualIngestInput = {
      source_type: 'manual',
      source_id,
      source_url: data.source_url,
      raw_content: data.raw_content,
      participants: data.participants,
      captured_at: data.captured_at,
      captured_by: effectiveCapturedBy,
      metadata: data.metadata as ManualIngestInput['metadata'],
    };

    let result: ManualIngestResult;
    try {
      result = await ingestManual(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ingest] ingestManual threw', { source_id, err: msg });
      await auditLog('ingest_manual_error', { source_id, error: msg });
      return NextResponse.json({ error: 'Ingest skill failed', detail: msg }, { status: 500 });
    }

    if (result.status === 'NO_SIGNAL') {
      await auditLog('ingest_no_signal', { source_id, source_type, reason: result.reason });
      return NextResponse.json({ status: result.status, reason: result.reason });
    }

    const records = result as Extract<ManualIngestResult, { status: 'records' }>;
    const vaultPath = `raw/inbox/manual-${data.captured_at.split('T')[0]}-${source_id.slice(0, 8)}.md`;

    await auditLog('ingest_records_written', {
      source_id,
      source_type,
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_count: records.action_items.length,
    });

    return NextResponse.json({
      status: 'records',
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_ids: records.action_items.map((ai) => ai.id),
    });
  }

  // ── voice_memo ────────────────────────────────────────────────────────────

  if (source_type === 'voice_memo') {
    const voiceData = data as z.infer<typeof voiceMemoPayloadSchema>;
    const input: VoiceMemoInput = {
      source_type: 'voice_memo',
      source_id,
      source_url: voiceData.source_url,
      raw_content: voiceData.raw_content ?? '',
      audio_stored_url: voiceData.audio_stored_url,
      captured_at: voiceData.captured_at,
      captured_by: effectiveCapturedBy,
      metadata: voiceData.metadata as VoiceMemoInput['metadata'],
    };

    let result: VoiceMemoResult;
    try {
      result = await ingestVoiceMemo(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ingest] ingestVoiceMemo threw', { source_id, err: msg });
      await auditLog('ingest_voice_memo_error', { source_id, error: msg });
      return NextResponse.json({ error: 'Ingest skill failed', detail: msg }, { status: 500 });
    }

    if (result.status === 'ABSTAIN') {
      await auditLog('ingest_abstain', {
        source_id,
        source_type,
        reason: result.reason,
        sprint_note: result.sprint_note,
      });
      return NextResponse.json({
        status: result.status,
        reason: result.reason,
        sprint_note: result.sprint_note,
      });
    }

    if (result.status === 'NO_SIGNAL') {
      await auditLog('ingest_no_signal', { source_id, source_type, reason: result.reason });
      return NextResponse.json({ status: result.status, reason: result.reason });
    }

    const records = result as Extract<VoiceMemoResult, { status: 'records' }>;
    const vaultPath = `raw/inbox/manual-${data.captured_at.split('T')[0]}-${source_id.slice(0, 8)}.md`;

    await auditLog('ingest_records_written', {
      source_id,
      source_type,
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_count: records.action_items.length,
    });

    return NextResponse.json({
      status: 'records',
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_ids: records.action_items.map((ai) => ai.id),
    });
  }

  // ── apple_note ────────────────────────────────────────────────────────────

  if (source_type === 'apple_note') {
    const noteData = data as z.infer<typeof appleNotePayloadSchema>;
    const input: AppleNoteIngestInput = {
      source_type: 'apple_note',
      source_id,
      source_url: noteData.source_url,
      raw_content: noteData.raw_content,
      participants: noteData.participants,
      captured_at: noteData.captured_at,
      captured_by: effectiveCapturedBy,
      metadata: noteData.metadata as AppleNoteIngestInput['metadata'],
    };

    let result: AppleNoteIngestResult;
    try {
      result = await ingestAppleNote(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ingest] ingestAppleNote threw', { source_id, err: msg });
      await auditLog('ingest_apple_note_error', { source_id, error: msg });
      return NextResponse.json({ error: 'Ingest skill failed', detail: msg }, { status: 500 });
    }

    if (result.status === 'NO_SIGNAL') {
      await auditLog('ingest_no_signal', { source_id, source_type, reason: result.reason });
      return NextResponse.json({ status: result.status, reason: result.reason });
    }

    const records = result as Extract<AppleNoteIngestResult, { status: 'records' }>;
    const vaultPath = `raw/inbox/apple-note-${noteData.captured_at.split('T')[0]}-${source_id.slice(0, 8)}.md`;

    await auditLog('ingest_records_written', {
      source_id,
      source_type,
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_count: records.action_items.length,
      inbox: records.inbox,
      captured_by_team_member: capturedByOverride?.id ?? null,
    });

    return NextResponse.json({
      status: 'records',
      ledger_id: records.ledger_row.id,
      vault_doc_path: vaultPath,
      action_item_ids: records.action_items.map((ai) => ai.id),
      inbox: records.inbox,
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
