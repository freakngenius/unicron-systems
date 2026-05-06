// lib/ingest/skills/ingest-manual.ts — Sprint 2 Stream D
//
// Ingest skill for `manual` source type: quick-capture notes posted by a
// team member via Atrium or Apple Notes. Runs LLM extraction with
// claude-haiku, writes to ledger + vault, returns action_items + signals.
//
// Status values:
//   NO_SIGNAL — content too short or model found nothing useful
//   records   — extraction succeeded; full set of written records returned

import Anthropic from '@anthropic-ai/sdk';
import { writeLedgerRow, writeVaultDoc, createActionItem } from '@/lib/ingest/base';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ManualIngestInput {
  source_type: 'manual'
  source_id: string
  source_url: string | null
  raw_content: string
  participants: { team_member_id?: string; name?: string; email?: string }[]
  captured_at: string
  captured_by: { type: 'human' | 'agent'; id: string }
  metadata?: {
    channel?: string // 'slack', 'atrium', 'apple_notes'
    photo_base64?: string
  }
}

export type ManualIngestResult =
  | { status: 'NO_SIGNAL'; reason: string }
  | {
      status: 'records'
      ledger_row: { id: string }
      vault_doc: { commit_sha: string }
      action_items: { id: string }[]
      signals: SignalRecord[]
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
  action_items: ExtractedActionItem[]
  signals: ExtractedSignal[]
  decisions: ExtractedDecision[]
}

// ─── Test seam ────────────────────────────────────────────────────────────

let _anthropicOverride: Anthropic | null = null
export function __setAnthropicForTests(client: Anthropic | null): void {
  _anthropicOverride = client
}

// ─── LLM extraction ───────────────────────────────────────────────────────

const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001'

const EXTRACTION_SYSTEM = `You process a quick capture note from a Unicron team member. Extract:
- summary: one sentence
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
    messages: [{ role: 'user', content: `Note captured at ${captured_at}:\n\n${raw_content}` }],
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
    console.error('[ingest-manual] failed to parse LLM JSON response', raw.slice(0, 200))
    return null
  }
}

// ─── Main export ──────────────────────────────────────────────────────────

export async function ingestManual(input: ManualIngestInput): Promise<ManualIngestResult> {
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
    console.error('[ingest-manual] extraction error', err)
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

  // Write ledger row
  const ledger_row = await writeLedgerRow({
    source_type: 'manual',
    source_id,
    source_url,
    participants: [],
    content_summary: result.summary ?? raw_content.slice(0, 200),
    content_full: raw_content,
    decisions: result.decisions ?? [],
    action_items: result.action_items ?? [],
    insights: result.signals ?? [],
    strength: 1.0,
    ttl_days: 30,
    created_by_human: captured_by.type === 'human' ? captured_by.id : null,
    created_by_agent: captured_by.type === 'agent' ? captured_by.id : null,
  })

  // Write vault doc
  const today = captured_at.split('T')[0]
  const vaultPath = `raw/inbox/manual-${today}-${source_id.slice(0, 8)}.md`
  const channel = metadata?.channel ?? 'atrium'

  const signalLines =
    result.signals?.length
      ? `\n## Signals\n\n${result.signals.map((s) => `- [${s.signal_type}] ${s.content}`).join('\n')}\n`
      : ''

  const vaultContent = `# Quick Capture — ${new Date(captured_at).toLocaleString()}

${raw_content}

## Extracted

**Summary:** ${result.summary ?? ''}
${signalLines}`

  const vault_doc = await writeVaultDoc(vaultPath, vaultContent, {
    type: 'quick-capture',
    date: today,
    captured_by: captured_by.id,
    channel,
    status: 'active',
    ttl_days: 30,
    ledger_id: ledger_row.id,
  })

  // Create action items
  const createdActionItems: { id: string }[] = []
  const requestedBy = {
    type: captured_by.type,
    id: captured_by.id,
    name: 'ingest-manual',
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
      console.error('[ingest-manual] failed to create action item', ai.title, err)
    }
  }

  // Build signals
  const signals: SignalRecord[] = (result.signals ?? []).map((s) => ({
    topic: s.topic ?? 'general',
    signal_type: s.signal_type,
    content: s.content,
    strength: 1.0,
  }))

  return {
    status: 'records',
    ledger_row,
    vault_doc,
    action_items: createdActionItems,
    signals,
  }
}
