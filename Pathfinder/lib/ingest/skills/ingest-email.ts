// lib/ingest/skills/ingest-email.ts — Sprint 5 Stream A
//
// Email ingest skill for the Unicron Nervous System.
// Accepts a batch of Gmail messages, filters spam/promos,
// runs LLM extraction, attributes to customers, deduplicates
// via ingest_processed, and writes to nervous_system.ledger.
//
// Status values returned per-message:
//   records    — extraction succeeded; ledger row written
//   NO_SIGNAL  — email non-substantive or confidence too low
//   ABSTAIN    — LLM extraction failed or confidence below 0.5
//
// Auto-revert gate: if a single run would produce >100 new ledger
// rows the skill skips remaining emails and logs an alert.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { writeLedgerRow } from '@/lib/ingest/base';

// ─── Spam / promo filter ──────────────────────────────────────────────────

const PROMO_DOMAINS = new Set([
  'mailchimp.com',
  'sendgrid.net',
  'constantcontact.com',
  'hubspot.com',
  'marketo.com',
  'klaviyo.com',
  'salesforce.com',
  'list-manage.com',
  'mandrillapp.com',
  'mailgun.org',
]);

const PROMO_SUBJECT_TOKENS = [
  'unsubscribe',
  'opt-out',
  'newsletter',
  'digest',
  'weekly roundup',
  'promotional',
];

function isPromoEmail(msg: EmailMessage): boolean {
  // Check list-unsubscribe header indicator
  if (msg.has_list_unsubscribe) return true;

  // Check from domain
  const fromMatch = msg.from.match(/@([\w.-]+)/);
  if (fromMatch) {
    const domain = fromMatch[1].toLowerCase();
    // Check exact domain and wildcard patterns (notifications.*, noreply@*)
    if (PROMO_DOMAINS.has(domain)) return true;
    if (domain.startsWith('notifications.')) return true;
    if (domain.startsWith('bounce.')) return true;
  }
  // Check noreply@ sender
  const fromLocal = msg.from.split('@')[0]?.toLowerCase() ?? '';
  if (fromLocal === 'noreply' || fromLocal === 'no-reply' || fromLocal === 'donotreply') {
    return true;
  }

  // Check subject keywords
  const subjectLower = msg.subject.toLowerCase();
  if (PROMO_SUBJECT_TOKENS.some((token) => subjectLower.includes(token))) return true;

  return false;
}

// ─── Input types ──────────────────────────────────────────────────────────

export interface EmailMessage {
  message_id: string;      // Gmail message ID (used as external_id for dedup)
  subject: string;
  from: string;            // "Name <email>" or "email"
  to: string;
  date: string;            // ISO datetime string
  body: string;            // plain-text body (strip HTML before passing)
  has_list_unsubscribe?: boolean; // true if List-Unsubscribe header present
}

export interface IngestEmailInput {
  messages: EmailMessage[];
  captured_by: { type: 'human' | 'agent'; id: string };
}

export interface IngestEmailResult {
  processed: number;
  skipped_spam: number;
  skipped_dup: number;
  signal_counts: {
    records: number;
    no_signal: number;
    abstain: number;
  };
}

// ─── Extraction types ─────────────────────────────────────────────────────

interface EmailExtractionResult {
  summary: string;
  decisions: { text: string; evidence_quote?: string; confidence: number }[];
  action_items: {
    title: string;
    description?: string;
    proposed_dri?: string;
    proposed_due?: string;
    priority?: 'low' | 'medium' | 'high' | 'irreversible';
  }[];
  insights: { text: string; confidence: number; candidate_for_memory?: boolean }[];
  overall_confidence: number;
}

// ─── Test seams ───────────────────────────────────────────────────────────

let _anthropicOverride: Anthropic | null = null;
export function __setAnthropicForEmailTests(client: Anthropic | null): void {
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

// ─── Deduplication helpers ────────────────────────────────────────────────

type SbClient = ReturnType<typeof nervousSystemClient>;

async function isAlreadyProcessed(sb: SbClient, externalId: string): Promise<boolean> {
  if (!sb) return false;
  const sbAny = sb as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          limit: (n: number) => Promise<{
            data: { id: string }[] | null;
            error: unknown;
          }>;
        };
      };
    };
  };
  const { data } = await sbAny
    .from('ingest_processed')
    .select('id')
    .eq('external_id', externalId)
    .limit(1);
  return !!(data && data.length > 0);
}

async function markProcessed(
  sb: SbClient,
  externalId: string,
  sourceType: string
): Promise<void> {
  if (!sb) return;
  const sbAny = sb as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  await sbAny.from('ingest_processed').insert({
    external_id: externalId,
    source_type: sourceType,
  });
}

// ─── Customer attribution ─────────────────────────────────────────────────

async function lookupCustomerByName(
  sb: SbClient,
  text: string
): Promise<string | null> {
  if (!sb) return null;

  // Fetch all customer names in one query (they're a small set)
  const sbAny = sb as unknown as {
    from: (t: string) => {
      select: (cols: string) => Promise<{
        data: { id: string; name: string }[] | null;
        error: unknown;
      }>;
    };
  };
  const { data } = await sbAny
    .from('customers')
    .select('id, name');

  if (!data || data.length === 0) return null;

  const textLower = text.toLowerCase();
  for (const customer of data) {
    if (textLower.includes(customer.name.toLowerCase())) {
      return customer.id;
    }
  }
  return null;
}

// ─── LLM extraction ───────────────────────────────────────────────────────

const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';
const EXTRACTION_SYSTEM = `You are an email analyst. Extract structured information from a business email.
Return ONLY valid JSON with this exact shape:
{
  "summary": "one paragraph summary",
  "decisions": [{"text": "...", "evidence_quote": "...", "confidence": 0.0-1.0}],
  "action_items": [{"title": "...", "description": "...", "proposed_dri": "name or null", "proposed_due": "ISO date or null", "priority": "low|medium|high|irreversible"}],
  "insights": [{"text": "...", "confidence": 0.0-1.0, "candidate_for_memory": true|false}],
  "overall_confidence": 0.0-1.0
}
If the email has no substantive business content (social, automated, marketing), set overall_confidence to 0 and leave arrays empty.`;

async function extractFromEmail(msg: EmailMessage): Promise<EmailExtractionResult | null> {
  const client =
    _anthropicOverride ??
    (() => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
      return new Anthropic({ apiKey });
    })();

  const userMsg = `Email:
Date: ${msg.date}
From: ${msg.from}
To: ${msg.to}
Subject: ${msg.subject}

---
${msg.body.slice(0, 6000)}
---`;

  const res = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 1500,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  });

  const raw = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  try {
    return JSON.parse(jsonStr) as EmailExtractionResult;
  } catch {
    console.error('[ingest-email] failed to parse LLM JSON response', raw.slice(0, 200));
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────

const AUTO_REVERT_ROW_LIMIT = 100;

export async function ingestEmail(input: IngestEmailInput): Promise<IngestEmailResult> {
  const sb = nervousSystemClient();

  const result: IngestEmailResult = {
    processed: 0,
    skipped_spam: 0,
    skipped_dup: 0,
    signal_counts: { records: 0, no_signal: 0, abstain: 0 },
  };

  let newLedgerRowsThisRun = 0;

  for (const msg of input.messages) {
    // Auto-revert gate
    if (newLedgerRowsThisRun >= AUTO_REVERT_ROW_LIMIT) {
      console.error(
        '[ingest-email] AUTO-REVERT GATE: reached 100 new ledger rows in a single run — skipping remaining emails',
        {
          total_messages: input.messages.length,
          processed_so_far: result.processed + result.skipped_spam + result.skipped_dup,
        }
      );
      break;
    }

    // 1. Spam / promo filter
    if (isPromoEmail(msg)) {
      result.skipped_spam++;
      continue;
    }

    // 2. Deduplication
    let alreadyDone = false;
    try {
      alreadyDone = await isAlreadyProcessed(sb, msg.message_id);
    } catch (err) {
      console.warn('[ingest-email] dedup check failed — processing anyway', {
        message_id: msg.message_id,
        err,
      });
    }
    if (alreadyDone) {
      result.skipped_dup++;
      continue;
    }

    // 3. LLM extraction
    let extraction: EmailExtractionResult | null;
    try {
      extraction = await extractFromEmail(msg);
    } catch (err) {
      console.error('[ingest-email] LLM extraction error', { message_id: msg.message_id, err });
      result.signal_counts.no_signal++;
      result.processed++;
      continue;
    }

    if (!extraction) {
      result.signal_counts.no_signal++;
      result.processed++;
      // Still mark as processed so we don't retry a broken message repeatedly
      try {
        await markProcessed(sb, msg.message_id, 'email');
      } catch {
        // non-fatal
      }
      continue;
    }

    // 4. Confidence gate
    if (extraction.overall_confidence < 0.5) {
      result.signal_counts.abstain++;
      result.processed++;
      try {
        await markProcessed(sb, msg.message_id, 'email');
      } catch {
        // non-fatal
      }
      continue;
    }

    // 5. Customer attribution — check subject + body
    const combinedText = `${msg.subject} ${msg.body}`;
    let customerId: string | null = null;
    try {
      customerId = await lookupCustomerByName(sb, combinedText);
    } catch (err) {
      console.warn('[ingest-email] customer lookup failed', {
        message_id: msg.message_id,
        err,
      });
    }

    // 6. Write ledger row
    try {
      await writeLedgerRow({
        source_type: 'email',
        source_id: msg.message_id,
        source_url: null,
        participants: [],
        content_summary: extraction.summary,
        content_full: msg.body,
        decisions: extraction.decisions,
        action_items: extraction.action_items,
        insights: extraction.insights,
        strength: extraction.overall_confidence,
        ttl_days: 30,
        created_by_human:
          input.captured_by.type === 'human' ? input.captured_by.id : null,
        created_by_agent:
          input.captured_by.type === 'agent' ? input.captured_by.id : null,
        customer_id: customerId,
      });

      newLedgerRowsThisRun++;
      result.signal_counts.records++;
    } catch (err) {
      console.error('[ingest-email] writeLedgerRow failed', {
        message_id: msg.message_id,
        err,
      });
      result.signal_counts.no_signal++;
      result.processed++;
      continue;
    }

    // 7. Mark as processed (dedup)
    try {
      await markProcessed(sb, msg.message_id, 'email');
    } catch (err) {
      // Non-fatal — worst case we re-process this message next run; dedup check prevents double ledger write
      console.warn('[ingest-email] failed to mark message as processed', {
        message_id: msg.message_id,
        err,
      });
    }

    result.processed++;
  }

  return result;
}
