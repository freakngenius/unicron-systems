// lib/kanban-writer.ts — Sprint 1 Stream C
//
// Routes an action item to the correct Notion kanban database and creates
// a card. After creation, updates action_items.kanban_card_id in Supabase.
//
// Routing algorithm (per Addendum 1 to the Nervous System spec):
//   1. If action_item.kanban_workspace is set → use it directly
//   2. If requested_by.type === 'human' and customer signal → 'pathfinder'
//   3. If product/code keywords (feature, bug, deploy, PR, route) → 'pathfinder'
//   4. If architecture keywords (infra, schema, migration, agent, system) → 'internal'
//   5. Default → 'internal'
//
// Notion DB IDs come from env vars:
//   NOTION_DB_INTERNAL_KANBAN    — always present; used as fallback
//   NOTION_DB_PATHFINDER_KANBAN  — Sprint 2+ setup; falls back to internal
//   NOTION_DB_METACRON_KANBAN    — Sprint 2+ setup; falls back to internal
//
// Uses the Notion REST API directly (fetch + NOTION_API_KEY).

// ─── Types ────────────────────────────────────────────────────────────────────

export type KanbanWorkspace = 'internal' | 'pathfinder' | 'metacron';

export interface ActionItemInput {
  /** UUID of the action item row in Supabase. Required to update kanban_card_id. */
  id: string;
  title: string;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  source?: string;
  kanban_workspace?: KanbanWorkspace;
  requested_by?: {
    type: 'human' | 'agent';
    id: string;
    name?: string;
  };
  /** Free-text signals used for routing when kanban_workspace is not set. */
  description?: string;
  /** Whether this action item came from a call ingest (affects Source field). */
  from_call?: boolean;
  /** Optional Notion user ID of the DRI (directly responsible individual). */
  dri_notion_user_id?: string;
}

export interface KanbanWriterResult {
  kanban_card_id: string;
  workspace: KanbanWorkspace;
  notion_page_url?: string;
}

// ─── Routing ──────────────────────────────────────────────────────────────────

const PRODUCT_CODE_KEYWORDS = /\b(feature|bug|deploy|pr\b|pull\s+request|route)\b/i;
const ARCH_KEYWORDS = /\b(infra|infrastructure|schema|migration|agent|system)\b/i;
const CUSTOMER_SIGNAL_KEYWORDS = /\b(customer|client|account|prospect|lead|deal|sales)\b/i;

/**
 * Determine which Notion kanban workspace an action item belongs to.
 * See routing algorithm in the module docblock.
 */
export function routeActionItem(item: ActionItemInput): KanbanWorkspace {
  // Rule 1: explicit assignment wins
  if (item.kanban_workspace) return item.kanban_workspace;

  const text = [item.title, item.description].filter(Boolean).join(' ');

  // Rule 2: human-requested + customer signal → pathfinder
  if (item.requested_by?.type === 'human' && CUSTOMER_SIGNAL_KEYWORDS.test(text)) {
    return 'pathfinder';
  }

  // Rule 3: product/code signal → pathfinder
  if (PRODUCT_CODE_KEYWORDS.test(text)) return 'pathfinder';

  // Rule 4: architecture signal → internal
  if (ARCH_KEYWORDS.test(text)) return 'internal';

  // Rule 5: default
  return 'internal';
}

// ─── Notion API helpers ───────────────────────────────────────────────────────

function getNotionApiKey(): string {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error('NOTION_API_KEY env var is not set');
  return key;
}

/**
 * Resolve the Notion database ID for a given workspace.
 * Falls back to NOTION_DB_INTERNAL_KANBAN if the target DB isn't configured yet.
 */
function resolveDbId(workspace: KanbanWorkspace): string {
  const internalId = process.env.NOTION_DB_INTERNAL_KANBAN;
  if (!internalId) throw new Error('NOTION_DB_INTERNAL_KANBAN env var is not set');

  if (workspace === 'pathfinder') {
    const id = process.env.NOTION_DB_PATHFINDER_KANBAN;
    if (!id) {
      console.warn(
        '[kanban-writer] NOTION_DB_PATHFINDER_KANBAN not set — falling back to NOTION_DB_INTERNAL_KANBAN',
      );
      return internalId;
    }
    return id;
  }

  if (workspace === 'metacron') {
    const id = process.env.NOTION_DB_METACRON_KANBAN;
    if (!id) {
      console.warn(
        '[kanban-writer] NOTION_DB_METACRON_KANBAN not set — falling back to NOTION_DB_INTERNAL_KANBAN',
      );
      return internalId;
    }
    return id;
  }

  return internalId;
}

/** Map our priority values to Notion select option names. */
function mapPriority(priority?: string): string {
  switch (priority) {
    case 'urgent': return 'Urgent';
    case 'high':   return 'High';
    case 'low':    return 'Low';
    default:       return 'Normal';
  }
}

interface NotionCreatePageResponse {
  id: string;
  url?: string;
  object?: string;
}

/**
 * Create a card in a Notion database.
 * Returns the created page ID.
 */
async function createNotionCard(
  databaseId: string,
  item: ActionItemInput,
): Promise<NotionCreatePageResponse> {
  const apiKey = getNotionApiKey();

  // Build Notion properties bag.
  // We use "Name" as the title column (standard Notion default).
  // Other columns depend on the actual DB schema — using select/text types
  // that are standard in a kanban template. If column names differ in the
  // live Notion DB, adjust the keys here.
  const properties: Record<string, any> = {
    Name: {
      title: [{ type: 'text', text: { content: item.title } }],
    },
    Status: {
      select: { name: 'Backlog' },
    },
    Priority: {
      select: { name: mapPriority(item.priority) },
    },
    Source: {
      select: { name: item.from_call ? 'Call' : (item.source ?? 'Manual') },
    },
  };

  // DRI — only set if a Notion user ID was resolved
  if (item.dri_notion_user_id) {
    properties['DRI'] = {
      people: [{ id: item.dri_notion_user_id }],
    };
  }

  const body = {
    parent: { database_id: databaseId },
    properties,
  };

  const resp = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Notion API error ${resp.status}: ${err}`);
  }

  return (await resp.json()) as NotionCreatePageResponse;
}

// ─── Supabase update ─────────────────────────────────────────────────────────

/**
 * Update action_items.kanban_card_id in the nervous_system schema.
 * Best-effort: throws if env vars are missing.
 */
async function updateActionItemKanbanCardId(
  actionItemId: string,
  kanbanCardId: string,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[kanban-writer] Cannot update action_items — missing Supabase env vars');
    return;
  }

  const resp = await fetch(
    `${url}/rest/v1/action_items?id=eq.${encodeURIComponent(actionItemId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Accept-Profile': 'nervous_system',
        'Content-Profile': 'nervous_system',
      },
      body: JSON.stringify({ kanban_card_id: kanbanCardId }),
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[kanban-writer] Failed to update action_items.kanban_card_id', {
      actionItemId,
      status: resp.status,
      err,
    });
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Route an action item to the correct kanban and create a Notion card.
 *
 * @param item - The action item to create a card for.
 * @returns { kanban_card_id, workspace } on success.
 * @throws if NOTION_API_KEY or NOTION_DB_INTERNAL_KANBAN are not set, or if
 *         the Notion API call fails.
 */
export async function writeKanbanCard(item: ActionItemInput): Promise<KanbanWriterResult> {
  const workspace = routeActionItem(item);
  const databaseId = resolveDbId(workspace);

  const page = await createNotionCard(databaseId, item);

  // Strip hyphens that Notion sometimes omits in IDs
  const kanban_card_id = page.id.replace(/-/g, '');

  // Update Supabase action_items row (best-effort)
  await updateActionItemKanbanCardId(item.id, kanban_card_id);

  return {
    kanban_card_id,
    workspace,
    notion_page_url: page.url,
  };
}
