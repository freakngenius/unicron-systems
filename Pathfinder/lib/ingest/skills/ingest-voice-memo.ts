// lib/ingest/skills/ingest-voice-memo.ts — Sprint 4 Stream A
//
// Voice memo ingest skill.
// Sprint 2 stub replaced with real Whisper transcription pipeline.
//
// Behaviour:
//   - If audio_buffer or audio_stored_url is present: call OpenAI Whisper,
//     get transcript, pass to ingestCall with source_type override.
//   - If raw_content is present (pre-transcribed): delegate to ingestManual.
//   - If no audio and no transcript: return ABSTAIN.
//
// Status values:
//   ABSTAIN   — no audio, Whisper failed, or OPENAI_API_KEY not configured
//   records   — extraction succeeded; returns full set of created records
//   NO_SIGNAL — transcript too short or model found nothing useful

export interface VoiceMemoInput {
  source_type: 'voice_memo'
  source_id: string
  source_url: string | null
  raw_content: string // empty string OR pre-transcribed text
  audio_stored_url?: string // URL in Supabase Storage (voice-memos bucket)
  audio_buffer?: Buffer // raw audio bytes (preferred — avoids extra HTTP round-trip)
  captured_at: string
  captured_by: { type: 'human' | 'agent'; id: string }
  metadata?: { duration_seconds?: number; mime_type?: string }
}

export type VoiceMemoResult =
  | { status: 'ABSTAIN'; reason: string; sprint_note: string }
  | { status: 'records'; ledger_row: { id: string }; vault_doc: { commit_sha: string }; action_items: { id: string }[]; signals: Record<string, unknown>[] }
  | { status: 'NO_SIGNAL'; reason: string }

// ─── Test seam ───────────────────────────────────────────────────────────────

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>
let _fetchOverride: FetchLike | null = null
export function __setFetchForVoiceMemoTests(fn: FetchLike | null): void {
  _fetchOverride = fn
}
function getFetch(): FetchLike {
  return _fetchOverride ?? fetch
}

// ─── Whisper timeout ──────────────────────────────────────────────────────

const WHISPER_TIMEOUT_MS = 30_000

// ─── Whisper transcription ─────────────────────────────────────────────────

/**
 * Transcribe audio via OpenAI Whisper API.
 * Accepts either a Buffer (preferred) or a URL (fetches first).
 * Returns the transcript string, or null if transcription failed.
 */
async function transcribeAudio(
  audioBuffer: Buffer | null,
  audioUrl: string | undefined,
  mimeType: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  let buffer: Buffer | null = audioBuffer

  // Fetch from URL if no buffer provided
  if (!buffer && audioUrl) {
    try {
      const doFetch = getFetch()
      const controller = new AbortController()
      const fetchTimeout = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS)
      const fetchRes = await doFetch(audioUrl, { signal: controller.signal })
      clearTimeout(fetchTimeout)
      if (!fetchRes.ok) {
        console.error('[ingest-voice-memo] failed to fetch audio from URL', {
          audioUrl,
          status: fetchRes.status,
        })
        return null
      }
      const arrayBuf = await fetchRes.arrayBuffer()
      buffer = Buffer.from(arrayBuf)
    } catch (err) {
      console.error('[ingest-voice-memo] audio fetch error', err)
      return null
    }
  }

  if (!buffer) return null

  // Build multipart/form-data for Whisper
  const formData = new FormData()
  // Convert Buffer to Uint8Array for Blob compatibility across runtimes
  const audioBlob = new Blob([new Uint8Array(buffer)], { type: mimeType })
  formData.append('file', audioBlob, `audio.${mimeTypeToExtension(mimeType)}`)
  formData.append('model', 'whisper-1')
  formData.append('response_format', 'json')

  const doFetch = getFetch()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS)

  try {
    const res = await doFetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // Note: do NOT set Content-Type when using FormData — browser/Node sets it with boundary
      },
      body: formData,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>')
      console.error('[ingest-voice-memo] Whisper API error', { status: res.status, body: text })
      return null
    }

    const json = (await res.json()) as { text?: string }
    return json.text?.trim() ?? null
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[ingest-voice-memo] Whisper API timed out after 30s')
    } else {
      console.error('[ingest-voice-memo] Whisper API fetch error', err)
    }
    return null
  }
}

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
  }
  return map[mimeType] ?? 'm4a'
}

// ─── Main export ──────────────────────────────────────────────────────────

export async function ingestVoiceMemo(input: VoiceMemoInput): Promise<VoiceMemoResult> {
  const { source_id, source_url, captured_at, captured_by, metadata, raw_content } = input

  const hasAudio = !!input.audio_buffer || !!input.audio_stored_url
  const hasTranscript = raw_content && raw_content.trim().length > 5

  // ── Path 1: Audio provided → Whisper → ingestCall ────────────────────────
  if (hasAudio) {
    // Guard: OPENAI_API_KEY required
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[ingest-voice-memo] OPENAI_API_KEY not configured — cannot transcribe')
      return {
        status: 'ABSTAIN',
        reason: 'OPENAI_API_KEY not configured',
        sprint_note: 'Set OPENAI_API_KEY in Vercel env vars to enable Whisper transcription.',
      }
    }

    const mimeType = metadata?.mime_type ?? 'audio/m4a'
    const transcript = await transcribeAudio(
      input.audio_buffer ?? null,
      input.audio_stored_url,
      mimeType,
    )

    if (!transcript) {
      return {
        status: 'ABSTAIN',
        reason: 'Whisper transcription failed or returned empty result',
        sprint_note: 'Audio received but transcription could not be completed. Check OPENAI_API_KEY and audio format.',
      }
    }

    // Dispatch to ingestCall with the Whisper transcript.
    // ingestCall uses source_type: 'call' internally; the ledger source_type
    // written will be 'call'. A follow-on task (not in scope here, requires
    // ingest-call.ts modification) should add a source_type override so the
    // ledger row is written as 'voice_memo'.
    //
    // confidence_floor: ingestCall has a hardcoded 0.5 floor. Voice memos
    // benefit from a lower 0.4 floor (raw thoughts are less coherent than calls).
    // That requires a parameter change to ingestCall (out of scope for this stream).
    const { ingestCall } = await import('./ingest-call')
    let callResult
    try {
      callResult = await ingestCall({
        source_type: 'call',
        source_id,
        source_url,
        raw_content: transcript,
        participants: [],
        captured_at,
        captured_by,
        metadata: {
          duration_seconds: metadata?.duration_seconds,
          // Pass channel hint through recorder field as closest available field
          // for voice_memo identification in downstream consumers.
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ingest-voice-memo] ingestCall threw after Whisper transcription', { source_id, err: msg })
      return {
        status: 'ABSTAIN',
        reason: `Ingest pipeline error: ${msg}`,
        sprint_note: 'Whisper transcription succeeded but downstream ingest failed.',
      }
    }

    // Map ingestCall result to VoiceMemoResult
    if (callResult.status === 'NO_SIGNAL') {
      return { status: 'NO_SIGNAL', reason: callResult.reason }
    }

    if (callResult.status === 'ABSTAIN') {
      return {
        status: 'ABSTAIN',
        reason: callResult.reason,
        sprint_note: 'Extraction confidence below threshold for this voice memo.',
      }
    }

    // records
    return {
      status: 'records',
      ledger_row: callResult.ledger_row,
      vault_doc: callResult.vault_doc,
      action_items: callResult.action_items,
      signals: callResult.signals as unknown as Record<string, unknown>[],
    }
  }

  // ── Path 2: Pre-transcribed text provided → ingestManual ────────────────
  if (hasTranscript) {
    const { ingestManual } = await import('./ingest-manual')
    return ingestManual({
      source_type: 'manual',
      source_id,
      source_url,
      raw_content,
      participants: [],
      captured_at,
      captured_by,
      metadata: {
        channel: 'voice_memo',
      },
    }) as Promise<VoiceMemoResult>
  }

  // ── Path 3: No audio and no transcript ───────────────────────────────────
  console.log('[ingest-voice-memo] no audio and no transcript — ABSTAIN', {
    source_id,
    audio_stored_url: input.audio_stored_url ?? null,
    duration_seconds: metadata?.duration_seconds ?? null,
    mime_type: metadata?.mime_type ?? null,
    captured_at,
  })

  return {
    status: 'ABSTAIN',
    reason: 'No audio and no transcript provided',
    sprint_note: 'Provide audio_buffer, audio_stored_url, or raw_content to ingest a voice memo.',
  }
}
