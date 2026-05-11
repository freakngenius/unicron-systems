// lib/agents/notion-kanban-sync.ts
// Bidirectional sync between the Internal Org Notion Kanban and
// nervous_system.notion_kanban_mirror.
//
// Pull path: notionKanbanPull() pages through the Notion database and upserts
// every row via public.ns_notion_kanban_upsert. Runs from the Inngest cron
// (notionKanbanSyncCron) every 5 minutes and on Atrium Work > Kanban tab mount
// via /api/internal/kanban-update?op=pull.
//
// Push path: notionKanbanPush() updates the Notion page Status property, then
// upserts the local mirror with origin='atrium_push'. Called from
// /api/internal/kanban-update on drag-and-drop.
//
// Verified column promotions are gated upstream by the UI (HARD CONSTRAINT 3 —
// human-only column). This module's push function refuses Verified writes
// unless the caller passes allow_verified=true.

import { createClient } from '@supabase/supabase-js';

const KANBAN_WORKSPACES: Record<string, string | undefined> = {
  internal:   process.env.NOTION_DB_INTERNAL_KANBAN,
  metacron:   process.env.NOTION_DB_METACRON_KANBAN,
  pathfinder: process.env.NOTION_DB_PATHFINDER_KANBAN,
  sales:      process.env.NOTION_DB_SALES_KANBAN,
  discovery:  process.env.NOTION_DB_DISCOVERY_KANBAN,
};

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function getServiceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function requireNotionToken(): string {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN not configured');
  return token;
}

function requireDatabaseId(workspace: string): string {
  const dbId = KANBAN_WORKSPACES[workspace];
  if (!dbId) throw new Error(`Notion database id not configured for workspace=${workspace}`);
  return dbId;
}

// ---------------------------------------------------------------------------
// Notion property extractors. The Internal Org database follows the
// conventional Unicron schema: Status (select), Priority (select),
// Surface (select), Source (select), DRI (people | rich_text), and an
// optional verify_criteria + linked_pr_url + implementation_notes column.
// All fields are optional — the extractor tolerates missing properties.
// ---------------------------------------------------------------------------

type NotionPage = {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties: Record<string, NotionProperty>;
};

type NotionProperty = {
  id?: string;
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  people?: Array<{ name?: string }>;
  url?: string | null;
  date?: { start?: string } | null;
};

function plainText(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  if (Array.isArray(prop.title) && prop.title.length > 0) {
    return prop.title.map((t) => t.plain_text ?? '').join('').trim() || null;
  }
  if (Array.isArray(prop.rich_text) && prop.rich_text.length > 0) {
    return prop.rich_text.map((t) => t.plain_text ?? '').join('').trim() || null;
  }
  if (typeof prop.url === 'string' && prop.url.length > 0) return prop.url;
  return null;
}

function selectName(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  if (prop.select?.name) return prop.select.name;
  if (prop.status?.name) return prop.status.name;
  return null;
}

function findProp(page: NotionPage, names: string[]): NotionProperty | undefined {
  for (const n of names) {
    const direct = page.properties[n];
    if (direct) return direct;
  }
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

function firstTitleProperty(page: NotionPage): NotionProperty | undefined {
  for (const k of Object.keys(page.properties)) {
    const p = page.properties[k];
    if (Array.isArray(p.title)) return p;
  }
  return undefined;
}

function peopleNames(prop: NotionProperty | undefined): string | null {
  if (!prop || !Array.isArray(prop.people)) return null;
  const names = prop.people.map((p) => p.name ?? '').filter(Boolean);
  return names.length === 0 ? null : names.join(', ');
}

export interface MirrorRow {
  notion_page_id: string;
  workspace: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  source: string | null;
  surface: string | null;
  dri_name: string | null;
  verify_criteria: string | null;
  implementation_notes: string | null;
  linked_pr_url: string | null;
  notion_url: string | null;
  notion_last_edited: string | null;
  raw: Record<string, unknown>;
}

function extract(page: NotionPage, workspace: string): MirrorRow {
  const titleProp = findProp(page, ['Title', 'Name']) ?? firstTitleProperty(page);
  const statusProp = findProp(page, ['Status', 'State']);
  const priorityProp = findProp(page, ['Priority']);
  const surfaceProp = findProp(page, ['Surface', 'Product', 'Area']);
  const sourceProp = findProp(page, ['Source']);
  const driPeopleProp = findProp(page, ['DRI', 'Owner', 'Assignee']);
  const verifyProp = findProp(page, ['Verify Criteria', 'Verify', 'Acceptance']);
  const notesProp = findProp(page, ['Implementation Notes', 'Notes']);
  const prProp = findProp(page, ['Linked PR', 'PR', 'PR URL', 'GitHub PR']);

  return {
    notion_page_id: page.id,
    workspace,
    title: plainText(titleProp),
    status: selectName(statusProp),
    priority: selectName(priorityProp),
    source: selectName(sourceProp),
    surface: selectName(surfaceProp),
    dri_name: peopleNames(driPeopleProp) ?? plainText(driPeopleProp),
    verify_criteria: plainText(verifyProp),
    implementation_notes: plainText(notesProp),
    linked_pr_url: plainText(prProp),
    notion_url: page.url ?? null,
    notion_last_edited: page.last_edited_time ?? null,
    raw: { properties: page.properties },
  };
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export interface PullResult {
  workspace: string;
  pulled: number;
  inserted: number;
  updated: number;
  error?: string;
}

export async function notionKanbanPull(
  workspace = 'internal',
  origin: 'inngest_cron' | 'atrium_mount' = 'inngest_cron',
): Promise<PullResult> {
  const token = requireNotionToken();
  const databaseId = requireDatabaseId(workspace);
  const supabase = getServiceClient();

  let pulled = 0;
  let inserted = 0;
  let updated = 0;
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Notion query failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json() as {
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };

    for (const page of data.results) {
      const row = extract(page, workspace);
      const { data: upsertResult, error } = await supabase.rpc('ns_notion_kanban_upsert', {
        p_notion_page_id:       row.notion_page_id,
        p_workspace:            row.workspace,
        p_title:                row.title,
        p_status:               row.status,
        p_priority:             row.priority,
        p_source:               row.source,
        p_surface:              row.surface,
        p_dri_name:             row.dri_name,
        p_verify_criteria:      row.verify_criteria,
        p_implementation_notes: row.implementation_notes,
        p_linked_pr_url:        row.linked_pr_url,
        p_notion_url:           row.notion_url,
        p_notion_last_edited:   row.notion_last_edited,
        p_raw:                  row.raw,
        p_origin:               'notion_pull',
      });
      if (error) {
        console.error('[notion-kanban-sync] upsert failed', row.notion_page_id, error.message);
        continue;
      }
      pulled += 1;
      if (upsertResult === 'inserted') inserted += 1;
      else if (upsertResult === 'updated') updated += 1;
    }

    cursor = data.has_more ? data.next_cursor ?? undefined : undefined;
  } while (cursor);

  await supabase.rpc('ns_notion_kanban_mark_pull', {
    p_workspace: workspace,
    p_count:     pulled,
    p_origin:    origin,
  });

  return { workspace, pulled, inserted, updated };
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export interface PushResult {
  ok: boolean;
  notion_page_id: string;
  status: string;
  origin: 'atrium_push';
  mirror_action?: string;
  error?: string;
}

export async function notionKanbanPush(args: {
  notion_page_id: string;
  status: string;
  workspace?: string;
  allow_verified?: boolean;
}): Promise<PushResult> {
  const { notion_page_id, status, workspace = 'internal', allow_verified = false } = args;
  const supabase = getServiceClient();

  if (status === 'Verified' && !allow_verified) {
    const err = 'Verified column is human-only. Promotion requires explicit operator confirmation (allow_verified=true).';
    await supabase.from('audit_log').insert({
      table_name: 'nervous_system.notion_kanban_mirror',
      action: 'notion_kanban_push_refused',
      payload: { notion_page_id, attempted_status: status, reason: 'verified_human_only' },
    });
    return { ok: false, notion_page_id, status, origin: 'atrium_push', error: err };
  }

  const token = requireNotionToken();

  const patchRes = await fetch(`${NOTION_API}/pages/${notion_page_id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({
      properties: {
        Status: { select: { name: status } },
      },
    }),
  });

  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => '');
    const error = `Notion PATCH failed (${patchRes.status}): ${text.slice(0, 300)}`;
    await supabase.from('audit_log').insert({
      table_name: 'nervous_system.notion_kanban_mirror',
      action: 'notion_kanban_push_failed',
      payload: { notion_page_id, attempted_status: status, error },
    });
    return { ok: false, notion_page_id, status, origin: 'atrium_push', error };
  }

  const page = await patchRes.json() as NotionPage;
  const row = extract(page, workspace);

  const { data: upsertResult } = await supabase.rpc('ns_notion_kanban_upsert', {
    p_notion_page_id:       row.notion_page_id,
    p_workspace:            row.workspace,
    p_title:                row.title,
    p_status:               row.status,
    p_priority:             row.priority,
    p_source:               row.source,
    p_surface:              row.surface,
    p_dri_name:             row.dri_name,
    p_verify_criteria:      row.verify_criteria,
    p_implementation_notes: row.implementation_notes,
    p_linked_pr_url:        row.linked_pr_url,
    p_notion_url:           row.notion_url,
    p_notion_last_edited:   row.notion_last_edited,
    p_raw:                  row.raw,
    p_origin:               'atrium_push',
  });

  return {
    ok: true,
    notion_page_id,
    status: row.status ?? status,
    origin: 'atrium_push',
    mirror_action: typeof upsertResult === 'string' ? upsertResult : undefined,
  };
}
