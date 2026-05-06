// __tests__/lib/kanban-writer.test.ts — Sprint 1 Stream C
//
// Unit tests for lib/kanban-writer.ts
//
// Tests the routing algorithm (all 5 cases) and the Notion API call.
// The Notion API and Supabase are mocked via vi.fn() on global.fetch.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Env setup ────────────────────────────────────────────────────────────────

const INTERNAL_DB = 'internal-db-id-000';
const PATHFINDER_DB = 'pathfinder-db-id-001';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTION_API_KEY = 'test-notion-key';
  process.env.NOTION_DB_INTERNAL_KANBAN = INTERNAL_DB;
  process.env.NOTION_DB_PATHFINDER_KANBAN = PATHFINDER_DB;
  delete process.env.NOTION_DB_METACRON_KANBAN;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  // Mock fetch to return a successful Notion page creation response
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'abc12345-def6-7890-abcd-ef1234567890',
        url: 'https://www.notion.so/abc12345def67890abcdef1234567890',
        object: 'page',
      }),
      { status: 200 },
    ),
  );
});

// ─── Routing algorithm tests ──────────────────────────────────────────────────

describe('routeActionItem — routing algorithm', () => {
  it('Rule 1: uses kanban_workspace if explicitly set (internal)', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-001',
      title: 'Some feature task',
      kanban_workspace: 'internal',
    });
    expect(result).toBe('internal');
  });

  it('Rule 1: uses kanban_workspace if explicitly set (pathfinder)', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-002',
      title: 'Infra migration needed',
      kanban_workspace: 'pathfinder',
    });
    // Even though title has architecture keywords, explicit workspace wins
    expect(result).toBe('pathfinder');
  });

  it('Rule 2: human-requested + customer signal → pathfinder', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-003',
      title: 'Follow up with customer about pricing',
      requested_by: { type: 'human', id: 'user-001' },
    });
    expect(result).toBe('pathfinder');
  });

  it('Rule 2: agent-requested + customer signal → does NOT trigger Rule 2', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-004',
      title: 'Send customer update email',
      description: 'Some plain description',
      requested_by: { type: 'agent', id: 'agent-001' },
    });
    // No product/code keywords → should fall to Rule 4 or 5
    // 'customer' is a customer signal keyword, but requested_by is agent, not human
    // → not Rule 2. 'update email' has no product/code keywords → Rule 4/5
    // 'send customer update email' — no infra/schema/migration/agent/system keywords
    // → Rule 5: default 'internal'
    expect(result).toBe('internal');
  });

  it('Rule 3: product/code keyword "feature" → pathfinder', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-005',
      title: 'Add feature for export CSV',
    });
    expect(result).toBe('pathfinder');
  });

  it('Rule 3: product/code keyword "bug" → pathfinder', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-006',
      title: 'Fix bug in the map rendering',
    });
    expect(result).toBe('pathfinder');
  });

  it('Rule 3: product/code keyword "deploy" → pathfinder', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-007',
      title: 'Deploy new version to Vercel',
    });
    expect(result).toBe('pathfinder');
  });

  it('Rule 3: product/code keyword "PR" (word boundary) → pathfinder', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-008',
      title: 'Review and merge PR for the scoring update',
    });
    expect(result).toBe('pathfinder');
  });

  it('Rule 4: architecture keyword "schema" → internal', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-009',
      title: 'Update schema for nervous_system tables',
    });
    expect(result).toBe('internal');
  });

  it('Rule 4: architecture keyword "migration" → internal', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-010',
      title: 'Write migration for new action_items table',
    });
    expect(result).toBe('internal');
  });

  it('Rule 4: architecture keyword "infra" → internal', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-011',
      title: 'Improve infra reliability for cron jobs',
    });
    expect(result).toBe('internal');
  });

  it('Rule 5: default → internal for generic task', async () => {
    const { routeActionItem } = await import('@/lib/kanban-writer');
    const result = routeActionItem({
      id: 'ai-012',
      title: 'Write up the weekly sync notes',
    });
    expect(result).toBe('internal');
  });
});

// ─── writeKanbanCard — Notion API integration ─────────────────────────────────

describe('writeKanbanCard', () => {
  it('calls Notion API with correct database ID for internal workspace', async () => {
    const { writeKanbanCard } = await import('@/lib/kanban-writer');
    const result = await writeKanbanCard({
      id: 'ai-100',
      title: 'Write migration for schema update',
      priority: 'high',
      from_call: true,
    });

    expect(result.workspace).toBe('internal');
    expect(result.kanban_card_id).toBeTruthy();

    // Verify the Notion API was called with the internal DB
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const notionCall = (fetchMock.mock.calls as unknown[][]).find(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('notion.com'),
    );
    expect(notionCall).toBeDefined();
    const callBody = JSON.parse((notionCall![1] as RequestInit)?.body as string);
    expect(callBody.parent.database_id).toBe(INTERNAL_DB);
    expect(callBody.properties.Status.select.name).toBe('Backlog');
    expect(callBody.properties.Priority.select.name).toBe('High');
    expect(callBody.properties.Source.select.name).toBe('Call');
  });

  it('calls Notion API with pathfinder DB for a feature task', async () => {
    const { writeKanbanCard } = await import('@/lib/kanban-writer');
    const result = await writeKanbanCard({
      id: 'ai-101',
      title: 'Add feature: bulk export leads to CSV',
      priority: 'urgent',
    });

    expect(result.workspace).toBe('pathfinder');

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const notionCall = (fetchMock.mock.calls as unknown[][]).find(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('notion.com'),
    );
    const callBody = JSON.parse((notionCall![1] as RequestInit)?.body as string);
    expect(callBody.parent.database_id).toBe(PATHFINDER_DB);
    expect(callBody.properties.Priority.select.name).toBe('Urgent');
  });

  it('falls back to internal DB when NOTION_DB_PATHFINDER_KANBAN is not set', async () => {
    delete process.env.NOTION_DB_PATHFINDER_KANBAN;

    const { writeKanbanCard } = await import('@/lib/kanban-writer');
    const result = await writeKanbanCard({
      id: 'ai-102',
      title: 'Fix bug in dashboard filters',
    });

    // Routing still says 'pathfinder' but it resolves to internal DB
    expect(result.workspace).toBe('pathfinder');

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const notionCall = (fetchMock.mock.calls as unknown[][]).find(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('notion.com'),
    );
    const callBody = JSON.parse((notionCall![1] as RequestInit)?.body as string);
    expect(callBody.parent.database_id).toBe(INTERNAL_DB);
  });

  it('falls back to internal DB when NOTION_DB_METACRON_KANBAN is not set', async () => {
    const { writeKanbanCard } = await import('@/lib/kanban-writer');
    const result = await writeKanbanCard({
      id: 'ai-103',
      title: 'Generic task',
      kanban_workspace: 'metacron',
    });

    expect(result.workspace).toBe('metacron');

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const notionCall = (fetchMock.mock.calls as unknown[][]).find(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('notion.com'),
    );
    const callBody = JSON.parse((notionCall![1] as RequestInit)?.body as string);
    expect(callBody.parent.database_id).toBe(INTERNAL_DB);
  });

  it('returns kanban_card_id from Notion page response', async () => {
    const { writeKanbanCard } = await import('@/lib/kanban-writer');
    const result = await writeKanbanCard({
      id: 'ai-104',
      title: 'Some task',
    });

    // The Notion response had id 'abc12345-def6-7890-abcd-ef1234567890'
    // Hyphens get stripped
    expect(result.kanban_card_id).toBe('abc12345def67890abcdef1234567890');
    expect(result.notion_page_url).toBe(
      'https://www.notion.so/abc12345def67890abcdef1234567890',
    );
  });

  it('throws when NOTION_API_KEY is not set', async () => {
    delete process.env.NOTION_API_KEY;
    const { writeKanbanCard } = await import('@/lib/kanban-writer');
    await expect(
      writeKanbanCard({ id: 'ai-105', title: 'Some task' }),
    ).rejects.toThrow('NOTION_API_KEY');
  });

  it('throws when NOTION_DB_INTERNAL_KANBAN is not set', async () => {
    delete process.env.NOTION_DB_INTERNAL_KANBAN;
    const { writeKanbanCard } = await import('@/lib/kanban-writer');
    await expect(
      writeKanbanCard({ id: 'ai-106', title: 'Some task' }),
    ).rejects.toThrow('NOTION_DB_INTERNAL_KANBAN');
  });

  it('also patches Supabase action_items.kanban_card_id', async () => {
    const { writeKanbanCard } = await import('@/lib/kanban-writer');
    await writeKanbanCard({
      id: 'ai-107',
      title: 'Deploy new version',
    });

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const supabaseCall = (fetchMock.mock.calls as unknown[][]).find(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('supabase'),
    );
    expect(supabaseCall).toBeDefined();
    const patchBody = JSON.parse((supabaseCall![1] as RequestInit)?.body as string);
    expect(patchBody.kanban_card_id).toBe('abc12345def67890abcdef1234567890');
  });
});
