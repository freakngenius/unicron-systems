// lib/calls-action-item-flow.ts — Calls Ingestion Sprint Stream C6
//                                  + Bug Fix 2026-05-13 (fan-out expansion)
//
// End-to-end transcript fan-out pipeline. Called by:
//   - Inngest function actionItemsExtractFromCallRun (event: call/transcript.uploaded)
//   - Sync from api/atrium/calls/upload.ts via processCallUpload (so the modal
//     can render extracted counts in its success view)
//
// Single LLM call returns:
//   { action_items: [...], decisions: [...], customer_mentions: [...] }
//
// Fan-out writes (all audit_log-gated):
//   1. For each action_item:
//        - ns_create_action_item_from_call → nervous_system.action_items
//        - Internal Org Kanban page (Notion)
//        - ns_set_action_item_notion_page_id
//        - linkActionItemToCall → bullet on the call's Notion page
//   2. For each decision:
//        - ns_create_decision_from_call → ledger row source_type='decision',
//          insights.parent_call_ledger_id linking back to the call
//   3. ns_link_call_customer_mentions(call_ledger_id, mentions[]) → patches the
//      call's ledger row with insights.mentioned_customers + sets customer_id
//      to the dominant resolved customer
//
// LLM call is gated by ANTHROPIC_API_KEY. When unset, the flow short-circuits
// to a no-op with a clear reason — the rest of the call ingestion still works
// (Notion + ledger were already written by lib/calls-ingest.ts).

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { linkActionItemToCall } from './notion-call-transcripts.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedActionItem {
  title: string;
  description: string;
  owner: string;
  outcome: string;
  steps: string[];
  priority: 'high' | 'medium' | 'low';
  due_iso: string | null;
}

export interface ExtractedDecision {
  decision: string;       // the decision text (what was decided)
  decided_by: string;     // who decided (free-text speaker label)
  rationale: string;      // why; may be empty
}

export interface ExtractedCustomerMention {
  name: string;           // customer name as spoken/written
  quote: string;          // verbatim transcript span supporting the mention
  confidence: number;     // 0..1
}

export interface ExtractedBundle {
  action_items: ExtractedActionItem[];
  decisions: ExtractedDecision[];
  customer_mentions: ExtractedCustomerMention[];
}

export interface FlowInput {
  call_id: string;             // nervous_system.ledger.id of the call row
  call_notion_page_id: string;
  call_notion_url: string;
  call_title: string | null;
  transcript_text: string;
  participants: string[];
  uploaded_by?: string;        // operator email; used by audit_log payloads
}

export interface FlowResult {
  extracted_counts: {
    action_items: number;
    decisions: number;
    customer_mentions: number;
  };
  written_action_items: Array<{
    id: string;
    title: string;
    owner: string;
    priority: string;
    notion_page_id: string | null;
  }>;
  written_decisions: Array<{ id: string; decision: string; decided_by: string }>;
  customer_mentions_result: {
    resolved: Array<{ name: string; customer_id: string; customer_name: string; quote: string; confidence: number }>;
    unresolved: Array<{ name: string; quote: string; confidence: number }>;
    dominant_customer_id: string | null;
    dominant_customer_name: string | null;
    count_resolved: number;
    count_unresolved: number;
  };
  errors: string[];
  skipped_reason?: string;
}

// ─── Service clients ──────────────────────────────────────────────────────────

function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env vars not configured');
  return createClient(url, key);
}

// ─── Extraction prompt ────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You extract structured intelligence from a call transcript for a 2-person company called Unicron Systems.

Return ONE JSON object with EXACTLY these three top-level keys:
{
  "action_items":      [ ... ],
  "decisions":         [ ... ],
  "customer_mentions": [ ... ]
}

action_items — every explicit commitment, follow-up, or deliverable spoken on the call.
  Each item:
    - title:       short imperative phrase, e.g. "Send Zedcor the pilot SOW"
    - description: one or two sentence rationale based on the transcript context
    - owner:       one of "Kyle", "Keenan", "Curtis", "Co-Pilot", or a free-text external name.
                   "Co-Pilot" means the autonomous AI agent can do this without a human.
                   Use the closest match — never invent owners.
    - outcome:     what "done" looks like in one sentence
    - steps:       array of 1-5 concrete sub-steps
    - priority:    "high" | "medium" | "low" based on urgency signals in the conversation
    - due_iso:     ISO 8601 datetime when a deadline is stated or inferable, else null

decisions — every concrete decision reached on the call. A decision is a choice between
alternatives, an architectural call, a customer promise, or a public statement that
forecloses future options. Casual opinions are NOT decisions; commitments to act are
action_items, not decisions.
  Each item:
    - decision:   one-sentence description of what was decided (verbatim if possible)
    - decided_by: who decided it, as a free-text speaker label (use "Kyle", "Keenan",
                  "Curtis", a customer name, or "joint" when multiple parties agreed)
    - rationale:  brief reason if stated; empty string if not

customer_mentions — every named customer, prospect, vendor, competitor, or company
mentioned during the call. Names only — no roles, no products. Each unique name once.
  Each item:
    - name:       the company / person name as spoken
    - quote:      verbatim transcript span where the name appears (a sentence is fine)
    - confidence: 0..1 — your confidence that this is a real, distinct entity (not a
                  pronoun or vague reference)

If a category has no items, return an empty array. Output ONLY the JSON object — no
prose, no markdown fences.`;

function buildExtractionUserMessage(input: FlowInput): string {
  const meta = [
    input.call_title ? `Title: ${input.call_title}` : null,
    input.participants.length > 0 ? `Participants: ${input.participants.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `${meta ? meta + '\n\n' : ''}Transcript:\n${input.transcript_text}`;
}

// Defensive JSON parser — Claude sometimes prefixes/suffixes with prose.
function parseExtractionResponse(raw: string): ExtractedBundle {
  const empty: ExtractedBundle = { action_items: [], decisions: [], customer_mentions: [] };
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return empty;
  const slice = raw.slice(first, last + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object') return empty;
  const obj = parsed as Record<string, unknown>;

  const action_items = Array.isArray(obj.action_items)
    ? obj.action_items
        .map((r): ExtractedActionItem | null => {
          if (!r || typeof r !== 'object') return null;
          const row = r as Partial<ExtractedActionItem>;
          if (!row.title || typeof row.title !== 'string') return null;
          const owner = typeof row.owner === 'string' && row.owner.trim() ? row.owner.trim() : 'Co-Pilot';
          const priorityRaw = typeof row.priority === 'string' ? row.priority.toLowerCase() : 'medium';
          const priority: ExtractedActionItem['priority'] =
            priorityRaw === 'high' || priorityRaw === 'low' ? priorityRaw : 'medium';
          return {
            title: row.title.trim(),
            description: typeof row.description === 'string' ? row.description.trim() : '',
            owner,
            outcome: typeof row.outcome === 'string' ? row.outcome.trim() : '',
            steps: Array.isArray(row.steps) ? row.steps.filter((s): s is string => typeof s === 'string').slice(0, 5) : [],
            priority,
            due_iso: typeof row.due_iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.due_iso) ? row.due_iso : null,
          };
        })
        .filter((x): x is ExtractedActionItem => x !== null)
    : [];

  const decisions = Array.isArray(obj.decisions)
    ? obj.decisions
        .map((r): ExtractedDecision | null => {
          if (!r || typeof r !== 'object') return null;
          const row = r as Partial<ExtractedDecision>;
          if (!row.decision || typeof row.decision !== 'string' || !row.decision.trim()) return null;
          return {
            decision: row.decision.trim(),
            decided_by: typeof row.decided_by === 'string' ? row.decided_by.trim() : '',
            rationale: typeof row.rationale === 'string' ? row.rationale.trim() : '',
          };
        })
        .filter((x): x is ExtractedDecision => x !== null)
    : [];

  const customer_mentions = Array.isArray(obj.customer_mentions)
    ? obj.customer_mentions
        .map((r): ExtractedCustomerMention | null => {
          if (!r || typeof r !== 'object') return null;
          const row = r as Partial<ExtractedCustomerMention>;
          if (!row.name || typeof row.name !== 'string' || !row.name.trim()) return null;
          const conf = typeof row.confidence === 'number' ? Math.max(0, Math.min(1, row.confidence)) : 0.5;
          return {
            name: row.name.trim(),
            quote: typeof row.quote === 'string' ? row.quote.trim() : '',
            confidence: conf,
          };
        })
        .filter((x): x is ExtractedCustomerMention => x !== null)
    : [];

  // Deduplicate customer_mentions by case-insensitive name; keep first occurrence.
  const seen = new Set<string>();
  const deduped: ExtractedCustomerMention[] = [];
  for (const m of customer_mentions) {
    const k = m.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(m);
  }

  return { action_items, decisions, customer_mentions: deduped };
}

export async function extractBundle(input: FlowInput): Promise<ExtractedBundle> {
  const anthropic = getAnthropic();
  if (!anthropic) return { action_items: [], decisions: [], customer_mentions: [] };

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3072,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content: buildExtractionUserMessage(input) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return parseExtractionResponse(text);
}

// Back-compat shim for existing call sites that only want action_items.
export async function extractActionItems(input: FlowInput): Promise<ExtractedActionItem[]> {
  const bundle = await extractBundle(input);
  return bundle.action_items;
}

// ─── Notion Internal Org Kanban: create card ──────────────────────────────────

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

interface KanbanCardInput {
  title: string;
  description: string;
  owner: string;
  priority: string;
  due_iso: string | null;
  call_notion_url: string;
  call_title: string | null;
}

async function createInternalKanbanCard(input: KanbanCardInput): Promise<{ notion_page_id: string; notion_url: string } | null> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DB_INTERNAL_KANBAN;
  if (!token || !dbId) return null;

  const priorityLabel =
    input.priority === 'high' ? 'High' :
    input.priority === 'low'  ? 'Low'  : 'Medium';
  const properties: Record<string, unknown> = {
    Title: { title: [{ type: 'text', text: { content: input.title.slice(0, 2000) } }] },
    Status: { select: { name: 'Backlog' } },
    Priority: { select: { name: priorityLabel } },
    Source: { select: { name: 'Call' } },
  };

  const callRef = input.call_title
    ? `${input.call_title} — ${input.call_notion_url}`
    : input.call_notion_url;

  const blocks: unknown[] = [
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `Owner: ${input.owner}` } }] } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `From call: ${callRef}` } }] } },
  ];
  if (input.description.trim()) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: input.description.slice(0, 2000) } }] },
    });
  }

  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties,
      children: blocks,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Notion Kanban POST ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id: string; url: string };
  return { notion_page_id: data.id, notion_url: data.url };
}

// ─── Public: run() ────────────────────────────────────────────────────────────

const EMPTY_RESULT_BASE: Omit<FlowResult, 'skipped_reason'> = {
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
};

export async function runActionItemExtraction(input: FlowInput): Promise<FlowResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ...EMPTY_RESULT_BASE,
      skipped_reason: 'ANTHROPIC_API_KEY not configured — transcript extraction is disabled',
    };
  }

  const bundle = await extractBundle(input);
  const counts = {
    action_items: bundle.action_items.length,
    decisions: bundle.decisions.length,
    customer_mentions: bundle.customer_mentions.length,
  };

  // Short-circuit: nothing extracted at all.
  if (counts.action_items === 0 && counts.decisions === 0 && counts.customer_mentions === 0) {
    return { ...EMPTY_RESULT_BASE, extracted_counts: counts };
  }

  const sb = getServiceSupabase();
  const writtenActionItems: FlowResult['written_action_items'] = [];
  const writtenDecisions: FlowResult['written_decisions'] = [];
  const errors: string[] = [];

  // ─── Action items ───────────────────────────────────────────────────────────
  for (const item of bundle.action_items) {
    try {
      const { data: actionItemId, error: insertErr } = await sb.rpc('ns_create_action_item_from_call', {
        p_call_id:          input.call_id,
        p_call_notion_url:  input.call_notion_url,
        p_title:            item.title,
        p_description:      item.description,
        p_owner_name:       item.owner,
        p_priority:         item.priority,
        p_due_at:           item.due_iso,
        p_kanban_workspace: 'internal',
      });
      if (insertErr || !actionItemId) {
        errors.push(`action_item insert(${item.title}): ${insertErr?.message ?? 'no id returned'}`);
        continue;
      }

      let notionPageId: string | null = null;
      try {
        const card = await createInternalKanbanCard({
          title: item.title,
          description: item.description,
          owner: item.owner,
          priority: item.priority,
          due_iso: item.due_iso,
          call_notion_url: input.call_notion_url,
          call_title: input.call_title,
        });
        notionPageId = card?.notion_page_id ?? null;
        if (notionPageId) {
          await sb.rpc('ns_set_action_item_notion_page_id', {
            p_action_item_id: actionItemId,
            p_notion_page_id: notionPageId,
          });

          try {
            await linkActionItemToCall(input.call_notion_page_id, {
              action_item_id: actionItemId as string,
              title: item.title,
              owner: item.owner,
              priority: item.priority,
              notion_kanban_url: card?.notion_url,
            });
          } catch (linkErr) {
            errors.push(`link-back(${item.title}): ${linkErr instanceof Error ? linkErr.message : 'unknown'}`);
          }
        }
      } catch (kanbanErr) {
        errors.push(`kanban-create(${item.title}): ${kanbanErr instanceof Error ? kanbanErr.message : 'unknown'}`);
      }

      writtenActionItems.push({
        id: actionItemId as string,
        title: item.title,
        owner: item.owner,
        priority: item.priority,
        notion_page_id: notionPageId,
      });
    } catch (err) {
      errors.push(`${item.title}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // ─── Decisions ──────────────────────────────────────────────────────────────
  for (const d of bundle.decisions) {
    try {
      const { data: decisionId, error: decErr } = await sb.rpc('ns_create_decision_from_call', {
        p_parent_call_ledger_id:  input.call_id,
        p_parent_call_notion_url: input.call_notion_url,
        p_parent_call_title:      input.call_title,
        p_decision_text:          d.decision,
        p_rationale:              d.rationale,
        p_decided_by:             d.decided_by,
        p_uploaded_by:            input.uploaded_by ?? 'unknown',
      });
      if (decErr || !decisionId) {
        errors.push(`decision insert: ${decErr?.message ?? 'no id returned'}`);
        continue;
      }
      writtenDecisions.push({
        id: decisionId as string,
        decision: d.decision,
        decided_by: d.decided_by,
      });
    } catch (err) {
      errors.push(`decision: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // ─── Customer mentions (batch RPC) ──────────────────────────────────────────
  let customerMentionsResult = EMPTY_RESULT_BASE.customer_mentions_result;
  if (bundle.customer_mentions.length > 0) {
    try {
      const { data, error: cmErr } = await sb.rpc('ns_link_call_customer_mentions', {
        p_call_ledger_id: input.call_id,
        p_mentions:       bundle.customer_mentions,
        p_uploaded_by:    input.uploaded_by ?? 'unknown',
      });
      if (cmErr) {
        errors.push(`customer_mentions: ${cmErr.message}`);
      } else if (data) {
        customerMentionsResult = data as FlowResult['customer_mentions_result'];
      }
    } catch (err) {
      errors.push(`customer_mentions: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return {
    extracted_counts: counts,
    written_action_items: writtenActionItems,
    written_decisions: writtenDecisions,
    customer_mentions_result: customerMentionsResult,
    errors,
  };
}

// ─── Exports for testing ──────────────────────────────────────────────────────

export const __internals = {
  parseExtractionResponse,
  buildExtractionUserMessage,
  createInternalKanbanCard,
};
