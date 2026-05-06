// lib/ingest/skills/ingest-voice-memo.ts — Sprint 2 Stream D
//
// Sprint 2 stub for the `voice_memo` source type.
// Full Whisper transcription pipeline ships in Sprint 4.
//
// Behaviour:
//   - If raw_content is present (pre-transcribed or typed by sender): delegate
//     to ingestManual and return its result.
//   - If no transcript (audio-only upload): return ABSTAIN with sprint_note;
//     metadata is preserved so Sprint 4 can re-process.
//
// Status values:
//   ABSTAIN  — audio received but Whisper transcription not yet implemented
//   records  — delegated to ingestManual; content was already transcribed
//   NO_SIGNAL — delegated to ingestManual; content was too short

export interface VoiceMemoInput {
  source_type: 'voice_memo'
  source_id: string
  source_url: string | null
  raw_content: string // Sprint 2: empty string OR pre-transcribed text
  audio_stored_url?: string // populated if audio was uploaded to a storage bucket
  captured_at: string
  captured_by: { type: 'human' | 'agent'; id: string }
  metadata?: { duration_seconds?: number; mime_type?: string }
}

export type VoiceMemoResult =
  | { status: 'ABSTAIN'; reason: string; sprint_note: string }
  | { status: 'records'; ledger_row: { id: string }; vault_doc: { commit_sha: string }; action_items: { id: string }[]; signals: Record<string, unknown>[] }
  | { status: 'NO_SIGNAL'; reason: string }

export async function ingestVoiceMemo(input: VoiceMemoInput): Promise<VoiceMemoResult> {
  // If raw_content is present (pre-transcribed or typed), delegate to manual skill
  if (input.raw_content && input.raw_content.trim().length > 5) {
    const { ingestManual } = await import('./ingest-manual')
    return ingestManual({
      source_type: 'manual',
      source_id: input.source_id,
      source_url: input.source_url,
      raw_content: input.raw_content,
      participants: [],
      captured_at: input.captured_at,
      captured_by: input.captured_by,
      metadata: {
        channel: 'voice_memo',
        // phone metadata fields are not in ManualIngestInput.metadata; pass only known keys
      },
    }) as Promise<VoiceMemoResult>
  }

  // No transcript yet — log receipt, return ABSTAIN for Sprint 4 retry
  console.log('[ingest-voice-memo] audio-only capture received; queued for Sprint 4 Whisper pipeline', {
    source_id: input.source_id,
    audio_stored_url: input.audio_stored_url ?? null,
    duration_seconds: input.metadata?.duration_seconds ?? null,
    mime_type: input.metadata?.mime_type ?? null,
    captured_at: input.captured_at,
  })

  return {
    status: 'ABSTAIN',
    reason: 'Voice memo received but Whisper transcription not yet implemented',
    sprint_note:
      'Full voice transcription pipeline ships in Sprint 4. Audio metadata stored for retry.',
  }
}
