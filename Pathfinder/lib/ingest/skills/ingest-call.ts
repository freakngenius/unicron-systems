// lib/ingest/skills/ingest-call.ts — Sprint 1 Stream B
//
// Ingest skill for call transcripts.
// Receives a raw transcript + metadata, runs LLM extraction, writes to
// nervous_system.ledger + vault + action_items, and returns structured output.
//
// Status values:
//   NO_SIGNAL  — transcript empty or non-substantive
//   ABSTAIN    — extraction confidence below 0.5 threshold
//   records    — extraction succeeded; returns full set of created records

import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { writeLedgerRow, writeVaultDoc, createActionItem } from '@/lib/ingest/base';

// ─── Input schema ─────────────────────────────────────────────────────────

export const IngestCallInputSchema = z.object({
  source_type: z.literal('call'),
  source_id: z.string(),
  source_url: z.string().nullable(),
  raw_content: z.string(),
  participants: z.array(
    z.object({
      team_member_id: z.string().uuid().optional(),
      name: z.string().optional(),
      email: z.string().optional(),
    })
  ),
  captured_at: z.string().datetime(),
  captured_by: z.object({
    type: z.enum(['human', 'agent']),
    id: z.string(),
  }),
  metadata: z
    .object({
      customer_name: z.string().optional(),
      duration_seconds: z.number().optional(),
      recorder: z.enum(['plaud', 'fathom']).optional(),
    })
    .optional(),
});
export type IngestCallInput = z.infer<typeof IngestCallInputSchema>;

// ─── Output types ─────────────────────────────────────────────────────────

export type IngestCallResult =
  | { status: 'NO_SIGNAL'; reason: string }
  | { status: 'ABSTAIN'; reason: string }
  | {
      status: 'records';
      ledger_row: { id: string };
      vault_doc: { commit_sha: string };
      action_items: { id: string }[];
      signals: SignalRecord[];
    };

interface ExtractedDecision {
  text: string;
  evidence_quote?: string;
  confidence: number;
}

interface ExtractedActionItem {
  title: string;
  description?: string;
  proposed_dri?: string;
  proposed_due?: string;
  priority?: 'low' | 'medium' | 'high' | 'irreversible';
  requested_by?: string;
  requested_of?: string;
}

interface ExtractedInsight {
  text: string;
  confidence: number;
  candidate_for_memory?: boolean;
}

interface SignalRecord {
  topic: string;
  signal_type: 'FACT' | 'QUESTION' | 'PATTERN' | 'RISK';
  content: string;
  strength: number;
}

interface ExtractionResult {
  summary: string;
  decisions: ExtractedDecision[];
  action_items: ExtractedActionItem[];
  insights: ExtractedInsight[];
  overall_confidence: number;
}

// ─── Test seams ───────────────────────────────────────────────────────────

let _anthropicOverride: Anthropic | null = null;
export function __setAnthropicForTests(client: Anthropic | null): void {
  _anthropicOverride = client;
}

// ─── Supabase client ──────────────────────────────────────────────────────

function nervousSystemClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    db: { schema: 'nervous_system' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Participant resolution ────────────────────────────────────────────────

async function resolveParticipants(
  participants: IngestCallInput['participants']
): Promise<{ uuids: string[]; participantNames: string[] }> {
  const sb = nervousSystemClient();
  const uuids: string[] = [];
  const participantNames: string[] = [];

  for (const p of participants) {
    if (p.team_member_id) {
      uuids.push(p.team_member_id);
      if (p.name) participantNames.push(p.name);
      continue;
    }
    // Try name/email lookup
    if (sb && (p.name || p.email)) {
      const sbAny = sb as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            or: (filter: string) => Promise<{
              data: { id: string; name: string }[] | null;
              error: unknown;
            }>;
          };
        };
      };
      const filters: string[] = [];
      if (p.name) filters.push(`name.ilike.${p.name}`);
      if (p.email) filters.push(`email.eq.${p.email}`);
      const { data } = await sbAny
        .from('team_members')
        .select('id, name')
        .or(filters.join(','));
      if (data && data.length > 0) {
        uuids.push(data[0].id);
        participantNames.push(data[0].name);
        continue;
      }
    }
    if (p.name) participantNames.push(p.name);
  }

  return { uuids, participantNames };
}

// ─── Customer lookup ──────────────────────────────────────────────────────

async function lookupCustomerId(customerName: string): Promise<string | null> {
  const sb = nervousSystemClient();
  if (!sb) return null;
  const sbAny = sb as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        ilike: (col: string, val: string) => {
          limit: (n: number) => Promise<{
            data: { id: string }[] | null;
            error: unknown;
          }>;
        };
      };
    };
  };
  const { data } = await sbAny
    .from('customers')
    .select('id')
    .ilike('name', `%${customerName}%`)
    .limit(1);
  return data?.[0]?.id ?? null;
}

// ─── LLM extraction ───────────────────────────────────────────────────────

const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';
const EXTRACTION_SYSTEM = `You are a call analyst. Extract structured information from a call transcript.
Return ONLY valid JSON with this exact shape:
{
  "summary": "one paragraph summary",
  "decisions": [{"text": "...", "evidence_quote": "...", "confidence": 0.0-1.0}],
  "action_items": [{"title": "...", "description": "...", "proposed_dri": "name", "proposed_due": "ISO date or null", "priority": "low|medium|high|irreversible", "requested_by": "name", "requested_of": "name"}],
  "insights": [{"text": "...", "confidence": 0.0-1.0, "candidate_for_memory": true|false}],
  "overall_confidence": 0.0-1.0
}
If the transcript has no substantive content, set overall_confidence to 0 and leave arrays empty.`;

async function extractFromTranscript(
  transcript: string,
  context: {
    participants: string[];
    customerName?: string;
    capturedAt: string;
    durationSeconds?: number;
  }
): Promise<ExtractionResult | null> {
  const client =
    _anthropicOverride ??
    (() => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
      return new Anthropic({ apiKey });
    })();

  const userMsg = `Call transcript:
Date: ${context.capturedAt}
Participants: ${context.participants.join(', ') || 'unknown'}
${context.customerName ? `Customer: ${context.customerName}` : ''}
${context.durationSeconds ? `Duration: ${Math.round(context.durationSeconds / 60)} minutes` : ''}

---
${transcript.slice(0, 8000)}
---`;

  const res = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 2000,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  });

  const raw = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  try {
    return JSON.parse(jsonStr) as ExtractionResult;
  } catch {
    console.error('[ingest-call] failed to parse LLM JSON response', raw.slice(0, 200));
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────

export async function ingestCall(input: IngestCallInput): Promise<IngestCallResult> {
  const validated = IngestCallInputSchema.parse(input);

  // 1. Guard: empty transcript
  if (!validated.raw_content.trim() || validated.raw_content.trim().length < 20) {
    return { status: 'NO_SIGNAL', reason: 'transcript empty or non-substantive' };
  }

  // 2. Resolve participants
  const { uuids: participantUuids, participantNames } = await resolveParticipants(
    validated.participants
  );

  // 3. Customer lookup
  const customerName = validated.metadata?.customer_name;
  const customerId = customerName ? await lookupCustomerId(customerName) : null;

  // 4. LLM extraction
  let extraction: ExtractionResult | null;
  try {
    extraction = await extractFromTranscript(validated.raw_content, {
      participants: participantNames,
      customerName,
      capturedAt: validated.captured_at,
      durationSeconds: validated.metadata?.duration_seconds,
    });
  } catch (err) {
    console.error('[ingest-call] extraction error', err);
    return { status: 'NO_SIGNAL', reason: 'LLM extraction failed' };
  }

  if (!extraction) {
    return { status: 'NO_SIGNAL', reason: 'transcript empty or non-substantive' };
  }

  // 5. Confidence gate
  if (extraction.overall_confidence < 0.5) {
    return {
      status: 'ABSTAIN',
      reason: `overall_confidence ${extraction.overall_confidence.toFixed(2)} below 0.5 threshold`,
    };
  }

  // 6. Write ledger row
  const ledger_row = await writeLedgerRow({
    source_type: 'call',
    source_id: validated.source_id,
    source_url: validated.source_url,
    participants: participantUuids,
    content_summary: extraction.summary,
    content_full: validated.raw_content,
    decisions: extraction.decisions,
    action_items: extraction.action_items,
    insights: extraction.insights,
    strength: extraction.overall_confidence,
    ttl_days: 30,
    created_by_human:
      validated.captured_by.type === 'human' ? validated.captured_by.id : null,
    created_by_agent:
      validated.captured_by.type === 'agent' ? validated.captured_by.id : null,
    customer_id: customerId,
  });

  // 7. Write vault doc
  const vaultPath = `Calls/${validated.captured_at.split('T')[0]}-${validated.source_id}.md`;
  const vaultContent = `## Summary\n\n${extraction.summary}\n\n## Transcript\n\n${validated.raw_content}`;
  const vault_doc = await writeVaultDoc(vaultPath, vaultContent, {
    source_type: 'call',
    source_id: validated.source_id,
    captured_at: validated.captured_at,
    participants: participantNames,
    customer: customerName ?? null,
    ledger_id: ledger_row.id,
    recorder: validated.metadata?.recorder ?? null,
  });

  // 8. Create action items
  const createdActionItems: { id: string }[] = [];
  const requestedBy = {
    type: validated.captured_by.type,
    id: validated.captured_by.id,
    name: 'ingest-call',
  };
  for (const ai of extraction.action_items) {
    try {
      const created = await createActionItem({
        ledger_id: ledger_row.id,
        title: ai.title,
        description: ai.description,
        requested_by: requestedBy,
        requested_of: requestedBy, // default to same; DRI assigned in app layer
        priority: ai.priority ?? 'medium',
        due_at: ai.proposed_due ?? null,
        customer_id: customerId,
      });
      createdActionItems.push(created);
    } catch (err) {
      console.error('[ingest-call] failed to create action item', ai.title, err);
    }
  }

  // 9. Build signals from insights
  const signals: SignalRecord[] = extraction.insights.map((ins) => ({
    topic: customerName ?? 'general',
    signal_type: ins.candidate_for_memory ? 'FACT' : 'PATTERN',
    content: ins.text,
    strength: ins.confidence,
  }));

  return {
    status: 'records',
    ledger_row,
    vault_doc,
    action_items: createdActionItems,
    signals,
  };
}
