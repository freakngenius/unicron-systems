// lib/agents/notion-calls-sync.ts
//
// Pull sync from the Notion Call Transcripts DB → nervous_system.calls.
// Mirrors the architecture of notion-kanban-sync.ts (PR #349) so the Atrium
// Work > Calls tab can read from a local mirror instead of hitting the
// Notion API on every render.
//
// Runs from the Inngest cron notion-calls-sync-pull every 10 minutes and on
// the Atrium Work > Calls tab mount via /api/internal/calls-sync?op=pull.
//
// Property extraction follows the Call Transcripts DB schema (data source
// 624b6032-4418-49c2-a97c-b62a3532ea19):
//   Title (title), Date (date), Participants (multi_select),
//   Key Takeaways (rich_text), Insights (rich_text), Transcript Files (file)
//
// transcript_body and external_participants stay null on the pull side — they
// are populated by the upload handler (api/atrium/calls/upload.ts) at write
// time. A future iteration can fetch page blocks and reconstruct both for
// rows that arrived via auto-ingestion connectors (C5).

import { createClient } from '@supabase/supabase-js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

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

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env vars not configured');
  return createClient(url, key);
}

// ─── Notion shape helpers ─────────────────────────────────────────────────────

type RichTextSlice = { plain_text?: string };
type NotionProperty = {
  type?: string;
  title?: RichTextSlice[];
  rich_text?: RichTextSlice[];
  date?: { start?: string } | null;
  multi_select?: Array<{ name?: string }>;
};

type NotionPage = {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties: Record<string, NotionProperty>;
};

function plainText(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  if (Array.isArray(prop.title) && prop.title.length > 0) {
    return prop.title.map((t) => t.plain_text ?? '').join('').trim() || null;
  }
  if (Array.isArray(prop.rich_text) && prop.rich_text.length > 0) {
    return prop.rich_text.map((t) => t.plain_text ?? '').join('').trim() || null;
  }
  return null;
}

function dateStart(prop: NotionProperty | undefined): string | null {
  return prop?.date?.start ?? null;
}

function multiSelectNames(prop: NotionProperty | undefined): string[] {
  if (!prop?.multi_select) return [];
  return prop.multi_select.map((o) => o.name ?? '').filter(Boolean);
}

function findProp(page: NotionPage, names: string[]): NotionProperty | undefined {
  for (const n of names) {
    if (page.properties[n]) return page.properties[n];
  }
  // Case-insensitive fallback.
  const lookup: Record<string, NotionProperty> = {};
  for (const k of Object.keys(page.properties)) {
    lookup[k.toLowerCase()] = page.properties[k];
  }
  for (const n of names) {
    const hit = lookup[n.toLowerCase()];
    if (hit) return hit;
  }
  return undefined;
}

// ─── Extract ──────────────────────────────────────────────────────────────────

export interface CallMirrorRow {
  notion_page_id: string;
  notion_url: string | null;
  title: string | null;
  call_date: string | null;            // ISO YYYY-MM-DD
  participants: string[];
  key_takeaways: string | null;
  insights: string | null;
  notion_last_edited: string | null;
}

export function extractCallRow(page: NotionPage): CallMirrorRow {
  const titleProp = findProp(page, ['Title', 'Name']);
  const dateProp = findProp(page, ['Date']);
  const participantsProp = findProp(page, ['Participants']);
  const keyTakeawaysProp = findProp(page, ['Key Takeaways']);
  const insightsProp = findProp(page, ['Insights']);

  const dateValue = dateStart(dateProp);
  const callDate = dateValue ? dateValue.slice(0, 10) : null;

  return {
    notion_page_id: page.id,
    notion_url: page.url ?? null,
    title: plainText(titleProp),
    call_date: callDate,
    participants: multiSelectNames(participantsProp),
    key_takeaways: plainText(keyTakeawaysProp),
    insights: plainText(insightsProp),
    notion_last_edited: page.last_edited_time ?? null,
  };
}

// ─── Pull ─────────────────────────────────────────────────────────────────────

export interface CallsPullResult {
  pulled: number;
  upserted: number;
  errors: number;
  error_messages: string[];
}

export async function notionCallsPull(
  origin: 'inngest_cron' | 'atrium_mount' = 'inngest_cron',
): Promise<CallsPullResult> {
  const token = requireNotionToken();
  const databaseId = requireCallTranscriptsDbId();
  const supabase = getServiceClient();

  let pulled = 0;
  let upserted = 0;
  let errors = 0;
  const errorMessages: string[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion query ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string;
    };

    for (const page of data.results ?? []) {
      pulled += 1;
      const row = extractCallRow(page);

      const { error } = await supabase.rpc('ns_upsert_call', {
        p_notion_page_id:        row.notion_page_id,
        p_notion_url:            row.notion_url,
        p_title:                 row.title,
        p_call_date:             row.call_date,
        p_participants:          row.participants,
        p_external_participants: [] as string[],
        p_key_takeaways:         row.key_takeaways,
        p_insights:              row.insights,
        p_transcript_body:       null,
        p_source:                null,
        p_notion_last_edited:    row.notion_last_edited,
        p_raw:                   { properties: page.properties },
      });

      if (error) {
        errors += 1;
        errorMessages.push(`${row.notion_page_id}: ${error.message}`);
      } else {
        upserted += 1;
      }
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  // Audit log: one ledger row per pull, summarising the run.
  try {
    await supabase.rpc('ns_append_ledger_signal', {
      p_source_type: 'audit',
      p_source_id:   `notion_calls_pull/${origin}`,
      p_summary:     `notion_calls_pull: ${pulled} pulled, ${upserted} upserted, ${errors} errors`,
      p_insights:    { pulled, upserted, errors, origin, errors_sample: errorMessages.slice(0, 5) },
    });
  } catch { /* non-fatal */ }

  return { pulled, upserted, errors, error_messages: errorMessages };
}

// ─── Exports for testing ──────────────────────────────────────────────────────

export const __internals = {
  plainText,
  dateStart,
  multiSelectNames,
  findProp,
};
