// src/__tests__/notion-calls-sync.test.ts
// Tests for lib/agents/notion-calls-sync.ts — the Notion Call Transcripts
// pull job that feeds nervous_system.calls.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;

const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  process.env.NOTION_TOKEN = 'ntn_test_token';
  process.env.NOTION_DB_CALL_TRANSCRIPTS = 'bd720f22aa1f40d3a9872f83c2a2d7a8';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: 'mirror-row-uuid', error: null });
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.resetModules();
});

function buildNotionPage(overrides: Partial<{
  id: string;
  url: string;
  last_edited_time: string;
  title: string;
  date: string;
  participants: string[];
  key_takeaways: string;
  insights: string;
}> = {}) {
  return {
    id: overrides.id ?? 'page-1',
    url: overrides.url ?? 'https://www.notion.so/page-1',
    last_edited_time: overrides.last_edited_time ?? '2026-05-12T10:00:00.000Z',
    properties: {
      Title: {
        type: 'title',
        title: [{ plain_text: overrides.title ?? 'Zedcor pilot kickoff' }],
      },
      Date: {
        type: 'date',
        date: { start: overrides.date ?? '2026-05-12' },
      },
      Participants: {
        type: 'multi_select',
        multi_select: (overrides.participants ?? ['Kyle', 'Keenan']).map((name) => ({ name })),
      },
      'Key Takeaways': {
        type: 'rich_text',
        rich_text: [{ plain_text: overrides.key_takeaways ?? 'Pilot signed off.' }],
      },
      Insights: {
        type: 'rich_text',
        rich_text: [{ plain_text: overrides.insights ?? 'Construction security wedge.' }],
      },
    },
  };
}

// ─── extractCallRow ───────────────────────────────────────────────────────────

describe('extractCallRow', () => {
  it('pulls all canonical properties from a Notion page', async () => {
    const { extractCallRow } = await import('../../lib/agents/notion-calls-sync');
    const row = extractCallRow(buildNotionPage());
    expect(row).toEqual({
      notion_page_id: 'page-1',
      notion_url: 'https://www.notion.so/page-1',
      title: 'Zedcor pilot kickoff',
      call_date: '2026-05-12',
      participants: ['Kyle', 'Keenan'],
      key_takeaways: 'Pilot signed off.',
      insights: 'Construction security wedge.',
      notion_last_edited: '2026-05-12T10:00:00.000Z',
    });
  });

  it('truncates ISO datetime to YYYY-MM-DD', async () => {
    const { extractCallRow } = await import('../../lib/agents/notion-calls-sync');
    const row = extractCallRow(buildNotionPage({ date: '2026-05-12T18:30:00.000-07:00' }));
    expect(row.call_date).toBe('2026-05-12');
  });

  it('returns empty participants and null fields when properties are absent', async () => {
    const { extractCallRow } = await import('../../lib/agents/notion-calls-sync');
    const row = extractCallRow({ id: 'p', url: 'u', last_edited_time: 't', properties: {} });
    expect(row.title).toBeNull();
    expect(row.call_date).toBeNull();
    expect(row.participants).toEqual([]);
    expect(row.key_takeaways).toBeNull();
    expect(row.insights).toBeNull();
  });

  it('matches property names case-insensitively', async () => {
    const { extractCallRow } = await import('../../lib/agents/notion-calls-sync');
    const page = {
      id: 'p',
      properties: {
        title: { type: 'title', title: [{ plain_text: 'lower-case key' }] },
        date: { type: 'date', date: { start: '2026-05-12' } },
      },
    } as Parameters<typeof extractCallRow>[0];
    const row = extractCallRow(page);
    expect(row.title).toBe('lower-case key');
    expect(row.call_date).toBe('2026-05-12');
  });
});

// ─── notionCallsPull ──────────────────────────────────────────────────────────

describe('notionCallsPull', () => {
  it('paginates through all results and upserts each via ns_upsert_call', async () => {
    const pages = [buildNotionPage({ id: 'p1' }), buildNotionPage({ id: 'p2' })];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ results: pages, has_more: true, next_cursor: 'cursor-a' }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ results: [buildNotionPage({ id: 'p3' })], has_more: false }),
        text: async () => '',
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { notionCallsPull } = await import('../../lib/agents/notion-calls-sync');
    const result = await notionCallsPull('inngest_cron');

    expect(result.pulled).toBe(3);
    expect(result.upserted).toBe(3);
    expect(result.errors).toBe(0);

    // 2 paginated query calls
    const queryCalls = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === 'string' && c[0].includes('/databases/'),
    );
    expect(queryCalls).toHaveLength(2);

    // Second call must include start_cursor.
    const secondBody = JSON.parse((queryCalls[1][1] as RequestInit).body as string);
    expect(secondBody.start_cursor).toBe('cursor-a');

    // ns_upsert_call called 3 times + 1 ledger signal for the audit row.
    const upsertCalls = mockRpc.mock.calls.filter(([name]) => name === 'ns_upsert_call');
    expect(upsertCalls).toHaveLength(3);
    expect(upsertCalls[0][1].p_notion_page_id).toBe('p1');
    expect(upsertCalls[0][1].p_participants).toEqual(['Kyle', 'Keenan']);
  });

  it('counts upsert errors without aborting the run', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        results: [buildNotionPage({ id: 'p1' }), buildNotionPage({ id: 'p2' })],
        has_more: false,
      }),
      text: async () => '',
    }) as unknown as typeof fetch;

    mockRpc.mockImplementation(async (name: string, args: { p_notion_page_id?: string }) => {
      if (name === 'ns_upsert_call' && args.p_notion_page_id === 'p2') {
        return { data: null, error: { message: 'unique violation' } };
      }
      return { data: 'ok', error: null };
    });

    const { notionCallsPull } = await import('../../lib/agents/notion-calls-sync');
    const result = await notionCallsPull('inngest_cron');
    expect(result.pulled).toBe(2);
    expect(result.upserted).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.error_messages[0]).toContain('p2');
  });

  it('throws when Notion query fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({}),
      text: async () => '{"code":"unauthorized"}',
    }) as unknown as typeof fetch;
    const { notionCallsPull } = await import('../../lib/agents/notion-calls-sync');
    await expect(notionCallsPull('inngest_cron')).rejects.toThrow(/Notion query 401/);
  });

  it('throws when NOTION_DB_CALL_TRANSCRIPTS env is missing', async () => {
    delete process.env.NOTION_DB_CALL_TRANSCRIPTS;
    const { notionCallsPull } = await import('../../lib/agents/notion-calls-sync');
    await expect(notionCallsPull('inngest_cron')).rejects.toThrow(/NOTION_DB_CALL_TRANSCRIPTS/);
  });
});
