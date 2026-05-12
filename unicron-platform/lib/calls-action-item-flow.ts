// lib/calls-action-item-flow.ts — Calls Ingestion Sprint Stream C6
//
// End-to-end action-item extraction pipeline. Called by:
//   - Inngest function actionItemsExtractFromCallRun (event: call/transcript.uploaded)
//   - Manual trigger via /api/atrium/calls/:id/extract-action-items (future)
//
// Flow:
//   1. Load the call from nervous_system.calls (or the freshly-uploaded ledger row).
//   2. Send the transcript + summary_notes to Claude with a structured-output
//      prompt asking for action items with title/owner/outcome/steps/due/priority.
//   3. For each extracted item:
//      a. INSERT into nervous_system.action_items via ns_create_action_item_from_call.
//      b. Create a Notion task in the Internal Org Kanban (NOTION_DB_INTERNAL_KANBAN)
//         linking back to the call's Notion page.
//      c. Patch the action_item row with the resulting Notion page id.
//      d. Append a bullet to the call's Notion page body via linkActionItemToCall.
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
  owner: string;            // "Kyle" | "Keenan" | "Curtis" | "Co-Pilot" | external name
  outcome: string;
  steps: string[];
  priority: 'high' | 'medium' | 'low';
  due_iso: string | null;   // ISO datetime when inferable, else null
}

export interface FlowInput {
  call_id: string;             // nervous_system.calls.id (or ledger id when running pre-mirror)
  call_notion_page_id: string;
  call_notion_url: string;
  call_title: string | null;
  transcript_text: string;     // joined transcript + summary
  participants: string[];
}

export interface FlowResult {
  extracted_count: number;
  written_action_items: Array<{
    id: string;
    title: string;
    owner: string;
    priority: string;
    notion_page_id: string | null;
  }>;
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

const EXTRACTION_SYSTEM = `You are an action-item extractor for a 2-person company called Unicron Systems.
You read a call transcript and surface every explicit commitment, follow-up, or deliverable.

Output a JSON object with one key "action_items" whose value is an array. Each item must have:
  - title:       short imperative phrase, e.g. "Send Zedcor the pilot SOW"
  - description: one or two sentence rationale based on the transcript context
  - owner:       one of "Kyle", "Keenan", "Curtis", "Co-Pilot", or a free-text external name.
                 "Co-Pilot" means the autonomous AI agent can do this without a human.
                 Use the closest match — never invent owners.
  - outcome:     what "done" looks like in one sentence
  - steps:       array of 1-5 concrete sub-steps
  - priority:    "high" | "medium" | "low" based on urgency signals in the conversation
  - due_iso:     ISO 8601 datetime when a deadline is stated or inferable, else null

If no action items are present, return { "action_items": [] }.
Output ONLY the JSON object — no surrounding text, no markdown fences.`;

function buildExtractionUserMessage(input: FlowInput): string {
  const meta = [
    input.call_title ? `Title: ${input.call_title}` : null,
    input.participants.length > 0 ? `Participants: ${input.participants.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `${meta ? meta + '\n\n' : ''}Transcript:\n${input.transcript_text}`;
}

// Defensive JSON parser — Claude sometimes prefixes/suffixes with prose.
function parseExtractionResponse(raw: string): ExtractedActionItem[] {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return [];
  const slice = raw.slice(first, last + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const items = (parsed as { action_items?: unknown }).action_items;
  if (!Array.isArray(items)) return [];
  return items
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
    .filter((x): x is ExtractedActionItem => x !== null);
}

export async function extractActionItems(input: FlowInput): Promise<ExtractedActionItem[]> {
  const anthropic = getAnthropic();
  if (!anthropic) return [];

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content: buildExtractionUserMessage(input) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return parseExtractionResponse(text);
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

  // The Internal Org Kanban schema has Status / Priority / Source / Surface
  // select columns + DRI + Title. Canonical Status options:
  //   Backlog | In Process | Review | Deployed | Bug Fixes | Verified | Broken Off
  // (CLAUDE.md's old "Not Yet Started" label was pre-rename — fetched live
  // schema is the source of truth.) We seed new cards in Backlog; Co-Pilot
  // tasks could be promoted to In Process later by an executor.
  // Priority maps directly to the extracted value (Low | Medium | High |
  // Irreversible — the schema's "Irreversible" option is the only one we
  // don't currently emit). Source='Call'.
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

export async function runActionItemExtraction(input: FlowInput): Promise<FlowResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      extracted_count: 0,
      written_action_items: [],
      errors: [],
      skipped_reason: 'ANTHROPIC_API_KEY not configured — action-item extraction is disabled',
    };
  }

  const items = await extractActionItems(input);
  if (items.length === 0) {
    return { extracted_count: 0, written_action_items: [], errors: [] };
  }

  const sb = getServiceSupabase();
  const written: FlowResult['written_action_items'] = [];
  const errors: string[] = [];

  for (const item of items) {
    try {
      // (a) Insert action_items row.
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
        errors.push(`insert(${item.title}): ${insertErr?.message ?? 'no id returned'}`);
        continue;
      }

      // (b) Create Notion Kanban card.
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

          // (c) Append a bullet to the call's Notion page body.
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

      written.push({
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

  return {
    extracted_count: items.length,
    written_action_items: written,
    errors,
  };
}

// ─── Exports for testing ──────────────────────────────────────────────────────

export const __internals = {
  parseExtractionResponse,
  buildExtractionUserMessage,
  createInternalKanbanCard,
};
