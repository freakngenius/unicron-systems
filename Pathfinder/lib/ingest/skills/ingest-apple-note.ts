// lib/ingest/skills/ingest-apple-note.ts — Sprint 4 Stream B
//
// Ingest skill for `apple_note` source type: notes captured via the iOS
// Shortcuts integration and posted to /api/ingest by a team member.
//
// Differences from ingest-manual.ts:
//   - source_type: 'apple_note'
//   - Lower confidence floor: 0.5 (notes are often partial thoughts)
//   - Uncertain / low-content items are routed to Inbox (metadata.inbox = true)
//   - Extract decisions/action_items/insights via same structured-output
//     prompt as ingest-manual
//
// Status values:
//   NO_SIGNAL — content too short or model found nothing useful
//   records   — extraction succeeded; full set of written records returned

import Anthropic from '@anthropic-ai/sdk';
import { writeLedgerRow, writeVaultDoc, createActionItem } from '@/lib/ingest/base';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AppleNoteIngestInput {
  source_type: 'apple_note'
  source_id: string
  source_url: string | null
  raw_content: string
  participants: { team_member_id?: string; name?: string; email?: string }[]
  captured_at: string
  captured_by: { type: 'human' | 'agent'; id: string }
  metadata?: {
    channel?: string        // 'apple_notes' | 'ios_shortcut'
    note_title?: string     // original Apple Note title if available
    photo_base64?: string
    inbox?: boolean
  }
}

export type AppleNoteIngestResult =
  | { status: 'NO_SIGNAL'; reason: string }
  | {
      status: 'records'
      ledger_row: { id: string }
      vault_doc: { commit_sha: string }
      action_items: { id: string }[]
      signals: SignalRecord[]
      inbox: boolean
    }

interface SignalRecord {
  topic: string
  signal_type: 'FACT' | 'QUESTION' | 'PATTERN' | 'RISK'
  content: string
  strength: number
}

interface ExtractedActionItem {
  title: string
  description?: string
  proposed_dri?: string
  proposed_due?: string | null
  priority?: 'low' | 'medium' | 'high' | 'irreversible'
  requested_by?: string
  requested_of?: string
}

interface ExtractedSignal {
  topic: string
  signal_type: 'FACT' | 'QUESTION' | 'PATTERN' | 'RISK'
  content: string
}

interface ExtractedDecision {
  text: string
  confidence: number
}

interface ExtractionResult {
  summary: string
  confidence: number   // 0–1: model's self-assessed confidence in extraction quality
  action_items: ExtractedActionItem[]
  signals: ExtractedSignal[]
  decisions: ExtractedDecision[]
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Notes below this confidence go to Inbox even if extraction succeeded. */
const CONFIDENCE_FLOOR = 0.5

// ─── Test seam ────────────────────────────────────────────────────────────

let _anthropicOverride: Anthropic | null = null
export function __setAnthropicForTests(client: Anthropic | null): void {
  _anthropicOverride = client
}

// ─── LLM extraction ───────────────────────────────────────────────────────

const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001'

const EXTRACTION_SYSTEM = `You process a quick-capture Apple Note from a Unicron team member. Notes are often partial thoughts, fragments, or in-the-moment observations. Extract what signal exists:
- summary: one sentence (or "no actionable content" if truly empty)
- confidence: 0.0–1.0 (how complete/substantive is this note?)
- action_items: array of {title, description, proposed_dri: "Kyle"|"Keenan"|"Curtis"|"unassigned", proposed_due: null, priority: "low"|"medium"|"high", requested_by: "captured_by user", requested_of: "proposed_dri"}
- signals: array of {topic, signal_type: "FACT"|"QUESTION"|"PATTERN"|"RISK", content}
- decisions: array of {text, confidence}

Return JSON only. If truly no useful content, return {"status":"NO_SIGNAL","reason":"..."}`

async function extractFromNote(
  raw_content: string,
  captured_at: string
): Promise<(ExtractionResult & { status?: never }) | { status: 'NO_SIGNAL'; reason: string } | null> {
  const client =
    _anthropicOverride ??
    (() => {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
      return new Anthropic({ apiKey })
    })()

  const msg = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 800,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content: `Apple Note captured at ${captured_at}:\n\n${raw_content}` }],
  })

  const raw = msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  // Extract first JSON object (handles any trailing prose)
  const match = jsonStr.match(/\{.*\}/s)
  if (!match) return null

  try {
    return JSON.parse(match[0]) as ExtractionResult | { status: 'NO_SIGNAL'; reason: string }
  } catch {
    console.error('[ingest-apple-note] failed to parse LLM JSON response', raw.slice(0, 200))
    return null
  }
}

// ─── Main export ──────────────────────────────────────────────────────────

export async function ingestAppleNote(input: AppleNoteIngestInput): Promise<AppleNoteIngestResult> {
  const { raw_content, source_id, source_url, captured_at, captured_by, metadata } = input

  // Guard: content too short
  if (!raw_content || raw_content.trim().length < 5) {
    return { status: 'NO_SIGNAL', reason: 'Content too short to extract signal' }
  }

  // LLM extraction
  let extracted: (ExtractionResult & { status?: never }) | { status: 'NO_SIGNAL'; reason: string } | null
  try {
    extracted = await extractFromNote(raw_content, captured_at)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ingest-apple-note] extraction error', err)
    return { status: 'NO_SIGNAL', reason: `LLM extraction failed: ${msg}` }
  }

  if (!extracted) {
    return { status: 'NO_SIGNAL', reason: 'transcript empty or non-substantive' }
  }

  // Model explicitly returned NO_SIGNAL
  if (extracted.status === 'NO_SIGNAL') {
    return { status: 'NO_SIGNAL', reason: extracted.reason ?? 'Model found no signal' }
  }

  const result = extracted as ExtractionResult

  // Route to inbox if model confidence is below the floor
  const confidence = typeof result.confidence === 'number' ? result.confidence : 1.0
  const sendToInbox = confidence < CONFIDENCE_FLOOR || (metadata?.inbox === true)

  // Write ledger row
  const ledger_row = await writeLedgerRow({
    source_type: 'apple_note',
    source_id,
    source_url,
    participants: [],
    content_summary: result.summary ?? raw_content.slice(0, 200),
    content_full: raw_content,
    decisions: result.decisions ?? [],
    action_items: result.action_items ?? [],
    insights: result.signals ?? [],
    strength: confidence,
    ttl_days: 30,
    created_by_human: captured_by.type === 'human' ? captured_by.id : null,
    created_by_agent: captured_by.type === 'agent' ? captured_by.id : null,
  })

  // Write vault doc
  const today = captured_at.split('T')[0]
  const noteTitle = metadata?.note_title ?? `apple-note-${source_id.slice(0, 8)}`
  const vaultPath = `raw/inbox/apple-note-${today}-${source_id.slice(0, 8)}.md`
  const channel = metadata?.channel ?? 'ios_shortcut'

  const signalLines =
    result.signals?.length
      ? `\n## Signals\n\n${result.signals.map((s) => `- [${s.signal_type}] ${s.content}`).join('\n')}\n`
      : ''

  const inboxTag = sendToInbox ? '\n> **Inbox** — low confidence capture; review before acting.\n' : ''

  const vaultContent = `# Apple Note — ${noteTitle}
> Captured at ${new Date(captured_at).toLocaleString()}
${inboxTag}
${raw_content}

## Extracted

**Summary:** ${result.summary ?? ''}
**Confidence:** ${(confidence * 100).toFixed(0)}%
${signalLines}`

  const vault_doc = await writeVaultDoc(vaultPath, vaultContent, {
    type: 'apple-note',
    date: today,
    captured_by: captured_by.id,
    channel,
    status: sendToInbox ? 'inbox' : 'active',
    ttl_days: 30,
    ledger_id: ledger_row.id,
    inbox: sendToInbox,
  })

  // Create action items (skip if routed to inbox — uncertain content)
  const createdActionItems: { id: string }[] = []

  if (!sendToInbox) {
    const requestedBy = {
      type: captured_by.type,
      id: captured_by.id,
      name: 'ingest-apple-note',
    }

    for (const ai of result.action_items ?? []) {
      try {
        const created = await createActionItem({
          ledger_id: ledger_row.id,
          title: ai.title,
          description: ai.description,
          requested_by: requestedBy,
          requested_of: requestedBy,
          priority: ai.priority ?? 'medium',
          due_at: ai.proposed_due ?? null,
        })
        createdActionItems.push(created)
      } catch (err) {
        console.error('[ingest-apple-note] failed to create action item', ai.title, err)
      }
    }
  }

  // Build signals
  const signals: SignalRecord[] = (result.signals ?? []).map((s) => ({
    topic: s.topic ?? 'general',
    signal_type: s.signal_type,
    content: s.content,
    strength: confidence,
  }))

  return {
    status: 'records',
    ledger_row,
    vault_doc,
    action_items: createdActionItems,
    signals,
    inbox: sendToInbox,
  }
}
