// lib/notion-call-transcripts.ts
// Service module for the Unicron Call Transcripts Notion DB.
//
// Two public functions:
//
//   createCallTranscriptPage(payload) → { notion_page_id, notion_url }
//     Creates a new page in the Call Transcripts DB (NOTION_DB_CALL_TRANSCRIPTS).
//     Sets Title / Date / Participants (multi_select) / Key Takeaways /
//     Insights properties. Appends the full transcript and summary notes as
//     paragraph blocks in the page body, chunked to respect Notion's 2000-char
//     rich_text limit. External participants (not in the canonical multi_select
//     option list) are written into the page body under "External participants:"
//     rather than the property — the picklist is intentionally kept clean.
//
//   linkActionItemToCall(callNotionPageId, actionItem) → void
//     Appends a bullet block to the call's Notion page body referencing the
//     extracted action item with its title, owner, priority, and a link to
//     the Internal Org Kanban Notion page.
//
// Path deviation: sprint spec called for src/lib/notion-call-transcripts.ts,
// landed at lib/notion-call-transcripts.ts to match the prevailing pattern
// for server-only Notion code (see lib/agents/notion-kanban-sync.ts).

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Notion limits
const RICH_TEXT_MAX = 2000;
const APPEND_CHILDREN_MAX = 100;

// Canonical Participants multi_select options on the Call Transcripts DB.
// Source: data source 624b6032-4418-49c2-a97c-b62a3532ea19 schema.
// Externals not in this list are written to the page body, not the property.
const CANONICAL_PARTICIPANTS = new Set([
  'Keenan',
  'Curtis',
  'Jack',
  'Kyle',
  'Kyle Doenz',
]);

export interface CallTranscriptPayload {
  title?: string;
  date?: string; // ISO date or datetime; defaults to today (UTC)
  participants?: string[];
  transcript?: string;
  summary_notes?: string;
  key_takeaways?: string;
  insights?: string;
  source?: 'manual_upload' | 'plaud' | 'fathom' | 'zoom';
}

export interface CreateCallTranscriptResult {
  notion_page_id: string;
  notion_url: string;
}

export interface LinkActionItemPayload {
  action_item_id: string;
  title: string;
  owner: string;
  priority: string;
  notion_kanban_url?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireNotionToken(): string {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN not configured');
  return token;
}

function requireCallTranscriptsDbId(): string {
  const id = process.env.NOTION_DB_CALL_TRANSCRIPTS;
  if (!id) throw new Error('NOTION_DB_CALL_TRANSCRIPTS not configured');
  return id;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function chunkString(s: string, limit: number): string[] {
  if (!s) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += limit) {
    out.push(s.slice(i, i + limit));
  }
  return out;
}

function richTextChunks(s: string): Array<{ type: 'text'; text: { content: string } }> {
  return chunkString(s, RICH_TEXT_MAX).map((content) => ({
    type: 'text' as const,
    text: { content },
  }));
}

function paragraphBlock(s: string) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richTextChunks(s) },
  };
}

function headingBlock(s: string, level: 1 | 2 | 3 = 2) {
  const key = `heading_${level}` as const;
  return {
    object: 'block',
    type: key,
    [key]: { rich_text: richTextChunks(s) },
  };
}

function bulletBlock(s: string) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richTextChunks(s) },
  };
}

function partitionParticipants(names: string[]): { internal: string[]; external: string[] } {
  const internal: string[] = [];
  const external: string[] = [];
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (CANONICAL_PARTICIPANTS.has(trimmed)) {
      internal.push(trimmed);
    } else {
      external.push(trimmed);
    }
  }
  return { internal, external };
}

function deriveTitle(payload: CallTranscriptPayload, internalParticipants: string[]): string {
  if (payload.title?.trim()) return payload.title.trim();
  const date = (payload.date ?? todayIsoDate()).slice(0, 10);
  const label =
    internalParticipants.length > 0 ? internalParticipants.join(' + ')
      : payload.source ? payload.source
      : 'Call';
  return `${label} — ${date}`;
}

async function notionFetch<T>(
  path: string,
  init: RequestInit & { token: string },
): Promise<T> {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${init.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status} ${path}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Body block builder ───────────────────────────────────────────────────────

function buildPageBody(payload: CallTranscriptPayload, external: string[]): unknown[] {
  const blocks: unknown[] = [];

  if (external.length > 0) {
    blocks.push(paragraphBlock(`External participants: ${external.join(', ')}`));
  }

  if (payload.source && payload.source !== 'manual_upload') {
    blocks.push(paragraphBlock(`Source: ${payload.source}`));
  }

  if (payload.summary_notes?.trim()) {
    blocks.push(headingBlock('Summary notes', 2));
    for (const chunk of chunkString(payload.summary_notes.trim(), RICH_TEXT_MAX)) {
      blocks.push(paragraphBlock(chunk));
    }
  }

  if (payload.transcript?.trim()) {
    blocks.push(headingBlock('Transcript', 2));
    for (const chunk of chunkString(payload.transcript.trim(), RICH_TEXT_MAX)) {
      blocks.push(paragraphBlock(chunk));
    }
  }

  blocks.push(headingBlock('Action items', 2));
  blocks.push(paragraphBlock('(populated by transcript skill STEP 2)'));

  return blocks;
}

// ─── Public: createCallTranscriptPage ────────────────────────────────────────

export async function createCallTranscriptPage(
  payload: CallTranscriptPayload,
): Promise<CreateCallTranscriptResult> {
  if (!payload.transcript?.trim() && !payload.summary_notes?.trim()) {
    throw new Error('createCallTranscriptPage: at least one of transcript or summary_notes is required');
  }

  const token = requireNotionToken();
  const dbId = requireCallTranscriptsDbId();

  const { internal, external } = partitionParticipants(payload.participants ?? []);
  const title = deriveTitle(payload, internal);
  const dateStr = (payload.date ?? todayIsoDate()).slice(0, 10);

  const properties: Record<string, unknown> = {
    Title: { title: richTextChunks(title) },
    Date: { date: { start: dateStr } },
  };

  if (internal.length > 0) {
    properties.Participants = {
      multi_select: internal.map((name) => ({ name })),
    };
  }

  if (payload.key_takeaways?.trim()) {
    properties['Key Takeaways'] = {
      rich_text: richTextChunks(payload.key_takeaways.trim()),
    };
  }

  if (payload.insights?.trim()) {
    properties.Insights = {
      rich_text: richTextChunks(payload.insights.trim()),
    };
  }

  const allBlocks = buildPageBody(payload, external);
  const firstWave = allBlocks.slice(0, APPEND_CHILDREN_MAX);
  const remainingBlocks = allBlocks.slice(APPEND_CHILDREN_MAX);

  const created = await notionFetch<{ id: string; url: string }>('/pages', {
    method: 'POST',
    token,
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties,
      children: firstWave,
    }),
  });

  // Append additional waves if the body exceeded 100 blocks.
  for (let i = 0; i < remainingBlocks.length; i += APPEND_CHILDREN_MAX) {
    const wave = remainingBlocks.slice(i, i + APPEND_CHILDREN_MAX);
    await notionFetch(`/blocks/${created.id}/children`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ children: wave }),
    });
  }

  return { notion_page_id: created.id, notion_url: created.url };
}

// ─── Public: linkActionItemToCall ─────────────────────────────────────────────

export async function linkActionItemToCall(
  callNotionPageId: string,
  actionItem: LinkActionItemPayload,
): Promise<void> {
  const token = requireNotionToken();

  const linkSuffix = actionItem.notion_kanban_url
    ? ` — ${actionItem.notion_kanban_url}`
    : '';
  const line = `[${actionItem.priority}] ${actionItem.title} → ${actionItem.owner}${linkSuffix}`;

  await notionFetch(`/blocks/${callNotionPageId}/children`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({
      children: [bulletBlock(line)],
    }),
  });
}

// ─── Exports for testing ──────────────────────────────────────────────────────

export const __internals = {
  partitionParticipants,
  deriveTitle,
  chunkString,
  buildPageBody,
  CANONICAL_PARTICIPANTS,
  RICH_TEXT_MAX,
  APPEND_CHILDREN_MAX,
};
