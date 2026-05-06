// lib/ingest/base.ts — Sprint 1 Stream B
//
// Base library for the Unicron Nervous System ingest pipeline.
// All writes go through this module; callers (e.g. ingest-call.ts) only
// see typed, validated inputs and outputs.
//
// writeVaultDoc    — commits a markdown file to freakngenius/unicron-knowledge via GitHub API
// writeLedgerRow   — inserts a row into nervous_system.ledger
// createActionItem — inserts a row into nervous_system.action_items
// dispatchKanbanCard — creates a Notion card in the Internal Org Kanban
// validateWithTabooKeeper — thin wrapper around lib/taboo-keeper.ts

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { validateAction } from '@/lib/taboo-keeper';

// ─── Supabase client (nervous_system schema) ──────────────────────────────

function nervousSystemClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  return createClient(url, key, {
    db: { schema: 'nervous_system' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Test seams ──────────────────────────────────────────────────────────

type SupabaseLike = ReturnType<typeof nervousSystemClient>;
let _supabaseOverride: SupabaseLike | null = null;
export function __setSupabaseForTests(client: SupabaseLike | null): void {
  _supabaseOverride = client;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
let _fetchOverride: FetchLike | null = null;
export function __setFetchForTests(fn: FetchLike | null): void {
  _fetchOverride = fn;
}

function getSupabase(): SupabaseLike {
  return _supabaseOverride ?? nervousSystemClient();
}

function getFetch(): FetchLike {
  return _fetchOverride ?? fetch;
}

// ─── Zod schemas ─────────────────────────────────────────────────────────

export const LedgerRowInputSchema = z.object({
  source_type: z.enum(['call', 'slack', 'email', 'voice_memo', 'apple_note', 'cowork_session', 'agent_run', 'manual']),
  source_id: z.string().optional(),
  source_url: z.string().nullable().optional(),
  participants: z.array(z.string().uuid()).optional(),
  content_summary: z.string().optional(),
  content_full: z.string().optional(),
  decisions: z.array(z.unknown()).optional(),
  action_items: z.array(z.unknown()).optional(),
  insights: z.array(z.unknown()).optional(),
  strength: z.number().min(0).max(1).optional(),
  ttl_days: z.number().int().positive().optional(),
  created_by_human: z.string().uuid().nullable().optional(),
  created_by_agent: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
});
export type LedgerRowInput = z.infer<typeof LedgerRowInputSchema>;

export const ActionItemInputSchema = z.object({
  ledger_id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  requested_by: z.object({
    type: z.enum(['human', 'agent']),
    id: z.string(),
    name: z.string().optional(),
  }),
  requested_of: z.object({
    type: z.enum(['human', 'agent']),
    id: z.string(),
    name: z.string().optional(),
  }),
  dri: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
  kanban_workspace: z.enum(['pathfinder', 'metacron', 'internal', 'sales']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'irreversible']).optional(),
  strength: z.number().min(0).max(1).optional(),
  ttl_days: z.number().int().positive().optional(),
  customer_id: z.string().uuid().nullable().optional(),
});
export type ActionItemInput = z.infer<typeof ActionItemInputSchema>;

export const TabooKeeperInputSchema = z.object({
  action_type: z.string(),
  target: z.string(),
  payload: z.unknown(),
  requested_by: z.object({
    type: z.enum(['human', 'agent']),
    id: z.string(),
    name: z.string(),
  }),
});
export type TabooKeeperInput = z.infer<typeof TabooKeeperInputSchema>;

// ─── writeLedgerRow ───────────────────────────────────────────────────────

export async function writeLedgerRow(row: LedgerRowInput): Promise<{ id: string }> {
  const validated = LedgerRowInputSchema.parse(row);
  const sb = getSupabase() as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await sb.from('ledger').insert({
    source_type: validated.source_type,
    source_id: validated.source_id ?? null,
    source_url: validated.source_url ?? null,
    participants: validated.participants ?? [],
    content_summary: validated.content_summary ?? null,
    content_full: validated.content_full ?? null,
    decisions: validated.decisions ?? [],
    action_items: validated.action_items ?? [],
    insights: validated.insights ?? [],
    strength: validated.strength ?? 1.0,
    ttl_days: validated.ttl_days ?? 30,
    created_by_human: validated.created_by_human ?? null,
    created_by_agent: validated.created_by_agent ?? null,
    customer_id: validated.customer_id ?? null,
  }).select('id').single();
  if (error) throw new Error(`writeLedgerRow failed: ${error.message}`);
  if (!data) throw new Error('writeLedgerRow: no data returned');
  return { id: data.id };
}

// ─── writeVaultDoc ────────────────────────────────────────────────────────

const VAULT_REPO = 'freakngenius/unicron-knowledge';
const VAULT_BRANCH = 'main';
const GITHUB_API_BASE = 'https://api.github.com';

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'unicron-ingest/1.0',
  };
}

function buildFrontmatter(fm: Record<string, unknown>): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

export async function writeVaultDoc(
  path: string,
  content: string,
  frontmatter: Record<string, unknown>
): Promise<{ commit_sha: string }> {
  const fullContent = buildFrontmatter(frontmatter) + content;
  const b64 = Buffer.from(fullContent, 'utf-8').toString('base64');

  const doFetch = getFetch();

  // Check if file already exists (need its SHA for updates)
  const getUrl = `${GITHUB_API_BASE}/repos/${VAULT_REPO}/contents/${path}`;
  let existingSha: string | undefined;
  try {
    const existing = await doFetch(getUrl, {
      headers: githubHeaders(),
    });
    if (existing.ok) {
      const json = (await existing.json()) as { sha?: string };
      existingSha = json.sha;
    }
  } catch {
    // File doesn't exist — that's fine
  }

  const putBody: Record<string, unknown> = {
    message: `ingest: write vault doc ${path}`,
    content: b64,
    branch: VAULT_BRANCH,
    committer: {
      name: 'Unicron Orchestrator',
      email: 'orchestrator@unicron.systems',
    },
    author: {
      name: 'Unicron Orchestrator',
      email: 'orchestrator@unicron.systems',
    },
  };
  if (existingSha) putBody.sha = existingSha;

  const putRes = await doFetch(getUrl, {
    method: 'PUT',
    headers: githubHeaders(),
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '<unreadable>');
    throw new Error(`writeVaultDoc GitHub PUT failed status=${putRes.status} body=${text}`);
  }

  const putJson = (await putRes.json()) as { commit?: { sha?: string } };
  const commit_sha = putJson.commit?.sha;
  if (!commit_sha) throw new Error('writeVaultDoc: no commit SHA returned');
  return { commit_sha };
}

// ─── createActionItem ─────────────────────────────────────────────────────

export async function createActionItem(item: ActionItemInput): Promise<{ id: string }> {
  const validated = ActionItemInputSchema.parse(item);
  const sb = getSupabase() as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await sb.from('action_items').insert({
    ledger_id: validated.ledger_id ?? null,
    title: validated.title,
    description: validated.description ?? null,
    requested_by: validated.requested_by,
    requested_of: validated.requested_of,
    dri: validated.dri ?? null,
    due_at: validated.due_at ?? null,
    kanban_workspace: validated.kanban_workspace ?? 'internal',
    priority: validated.priority ?? 'medium',
    strength: validated.strength ?? 1.0,
    ttl_days: validated.ttl_days ?? 90,
    customer_id: validated.customer_id ?? null,
  }).select('id').single();
  if (error) throw new Error(`createActionItem failed: ${error.message}`);
  if (!data) throw new Error('createActionItem: no data returned');
  return { id: data.id };
}

// ─── dispatchKanbanCard ───────────────────────────────────────────────────

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function notionHeaders(): Record<string, string> {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error('NOTION_API_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

export async function dispatchKanbanCard(
  action_item_id: string
): Promise<{ kanban_card_id: string }> {
  const dbId = process.env.NOTION_DB_INTERNAL_KANBAN;
  if (!dbId) throw new Error('NOTION_DB_INTERNAL_KANBAN is not set');

  // Fetch the action item to pull title/description
  const sb = getSupabase() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{
            data: { title: string; description: string | null; priority: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data: item, error: fetchErr } = await sb
    .from('action_items')
    .select('title, description, priority')
    .eq('id', action_item_id)
    .single();
  if (fetchErr) throw new Error(`dispatchKanbanCard fetch failed: ${fetchErr.message}`);
  if (!item) throw new Error(`dispatchKanbanCard: action_item ${action_item_id} not found`);

  const doFetch = getFetch();
  const body = {
    parent: { database_id: dbId },
    properties: {
      Name: {
        title: [{ text: { content: item.title } }],
      },
      Status: {
        select: { name: 'Backlog' },
      },
      Priority: {
        select: { name: item.priority ?? 'medium' },
      },
    },
    children: item.description
      ? [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ text: { content: item.description } }],
            },
          },
        ]
      : [],
  };

  const res = await doFetch(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable>');
    throw new Error(`dispatchKanbanCard Notion API failed status=${res.status} body=${text}`);
  }

  const json = (await res.json()) as { id?: string };
  const kanban_card_id = json.id;
  if (!kanban_card_id) throw new Error('dispatchKanbanCard: no page ID returned from Notion');

  // Update action_items.kanban_card_id
  const sbUpdate = getSupabase() as unknown as {
    from: (t: string) => {
      update: (vals: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error: updateErr } = await sbUpdate
    .from('action_items')
    .update({ kanban_card_id })
    .eq('id', action_item_id);
  if (updateErr) {
    // Non-fatal — card was created; just log
    console.error('[ingest/base] failed to update kanban_card_id on action_item', updateErr.message);
  }

  return { kanban_card_id };
}

// ─── validateWithTabooKeeper ──────────────────────────────────────────────

export async function validateWithTabooKeeper(
  action: TabooKeeperInput
): Promise<{ pass: boolean; reason?: string }> {
  const validated = TabooKeeperInputSchema.parse(action);
  const result = await validateAction({
    action_type: validated.action_type,
    target: validated.target,
    payload: validated.payload ?? null,
    requested_by: validated.requested_by,
  });
  return {
    pass: result.verdict === 'pass',
    reason: result.reason ?? result.warning,
  };
}
