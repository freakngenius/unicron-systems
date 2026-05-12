// src/__tests__/calls-action-item-flow.test.ts
// Tests for lib/calls-action-item-flow.ts — C6 action-item extraction
// pipeline (LLM extract → ns_create_action_item_from_call → Notion Kanban
// card → linkActionItemToCall bullet on the call page).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;

const mockRpc = vi.fn();
const mockCreate = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = { create: mockCreate };
    constructor(_args: { apiKey?: string }) {
      // store nothing
    }
  }
  return { default: FakeAnthropic };
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.NOTION_TOKEN = 'ntn_test_token';
  process.env.NOTION_DB_INTERNAL_KANBAN = 'kanban-db-id';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  mockRpc.mockReset();
  mockCreate.mockReset();

  // Default Notion-side fetches return success (Kanban card create + link bullet append).
  globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/v1/pages')) {
      return {
        ok: true, status: 200,
        json: async () => ({ id: 'kanban-page-id', url: 'https://www.notion.so/kanban-page' }),
        text: async () => '{}',
      };
    }
    if (url.includes('/v1/blocks/')) {
      return {
        ok: true, status: 200,
        json: async () => ({ results: [] }),
        text: async () => '{}',
      };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

// ─── parseExtractionResponse ──────────────────────────────────────────────────

describe('parseExtractionResponse', () => {
  it('parses a valid LLM JSON response into action items', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({
      action_items: [
        { title: 'Send SOW', owner: 'Kyle', priority: 'high', outcome: 'SOW emailed', steps: ['Draft', 'Email'], due_iso: '2026-05-15', description: 'Pilot SOW' },
        { title: 'Schedule kickoff', owner: 'Co-Pilot', priority: 'medium', outcome: 'meeting scheduled', steps: ['Find times'], due_iso: null },
      ],
    });
    const items = __internals.parseExtractionResponse(raw);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Send SOW');
    expect(items[0].priority).toBe('high');
    expect(items[1].owner).toBe('Co-Pilot');
  });

  it('extracts JSON even when wrapped in surrounding prose', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = 'Here are the action items: {"action_items":[{"title":"X","owner":"Kyle"}]}\nThat\'s all.';
    const items = __internals.parseExtractionResponse(raw);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('X');
  });

  it('returns empty array on malformed JSON', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    expect(__internals.parseExtractionResponse('not json at all')).toEqual([]);
    expect(__internals.parseExtractionResponse('{ broken json')).toEqual([]);
  });

  it('drops entries missing a title', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ action_items: [{ owner: 'Kyle' }, { title: 'OK', owner: 'Co-Pilot' }] });
    expect(__internals.parseExtractionResponse(raw)).toHaveLength(1);
  });

  it('coerces invalid priority values to "medium"', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ action_items: [{ title: 'X', owner: 'Kyle', priority: 'critical' }] });
    expect(__internals.parseExtractionResponse(raw)[0].priority).toBe('medium');
  });

  it('drops invalid due_iso values', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ action_items: [{ title: 'X', owner: 'Kyle', due_iso: 'next Friday' }] });
    expect(__internals.parseExtractionResponse(raw)[0].due_iso).toBeNull();
  });

  it('defaults missing owner to "Co-Pilot"', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ action_items: [{ title: 'X' }] });
    expect(__internals.parseExtractionResponse(raw)[0].owner).toBe('Co-Pilot');
  });
});

// ─── runActionItemExtraction ──────────────────────────────────────────────────

describe('runActionItemExtraction', () => {
  it('skips when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { runActionItemExtraction } = await import('../../lib/calls-action-item-flow');
    const r = await runActionItemExtraction({
      call_id: 'c1',
      call_notion_page_id: 'p1',
      call_notion_url: 'https://notion.so/p1',
      call_title: 'Zedcor kickoff',
      transcript_text: 'Kyle: send Zedcor the SOW',
      participants: ['Kyle'],
    });
    expect(r.skipped_reason).toMatch(/ANTHROPIC_API_KEY/);
    expect(r.written_action_items).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns zero-extracted when the LLM finds no action items', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"action_items":[]}' }],
    });
    const { runActionItemExtraction } = await import('../../lib/calls-action-item-flow');
    const r = await runActionItemExtraction({
      call_id: 'c1',
      call_notion_page_id: 'p1',
      call_notion_url: 'https://notion.so/p1',
      call_title: 't',
      transcript_text: 'small talk only',
      participants: [],
    });
    expect(r.extracted_count).toBe(0);
    expect(r.written_action_items).toEqual([]);
  });

  it('writes each extracted item, creates Kanban card, links back', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          action_items: [
            { title: 'Send Zedcor SOW', owner: 'Kyle', priority: 'high', description: 'Pilot SOW' },
            { title: 'Draft FAQ', owner: 'Co-Pilot', priority: 'medium' },
          ],
        }),
      }],
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'ns_create_action_item_from_call') return { data: `ai-${Math.random().toString(36).slice(2, 6)}`, error: null };
      return { data: null, error: null };
    });

    const { runActionItemExtraction } = await import('../../lib/calls-action-item-flow');
    const r = await runActionItemExtraction({
      call_id: 'c1',
      call_notion_page_id: 'call-page-1',
      call_notion_url: 'https://notion.so/call-page-1',
      call_title: 'Zedcor pilot kickoff',
      transcript_text: 'Kyle: I\'ll send Zedcor the SOW. We need a FAQ draft.',
      participants: ['Kyle'],
    });

    expect(r.extracted_count).toBe(2);
    expect(r.written_action_items).toHaveLength(2);
    expect(r.errors).toEqual([]);

    const createCalls = mockRpc.mock.calls.filter(([n]) => n === 'ns_create_action_item_from_call');
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0][1].p_owner_name).toBe('Kyle');
    expect(createCalls[0][1].p_priority).toBe('high');
    expect(createCalls[1][1].p_owner_name).toBe('Co-Pilot');

    // Each extracted item should also call ns_set_action_item_notion_page_id once.
    const setCalls = mockRpc.mock.calls.filter(([n]) => n === 'ns_set_action_item_notion_page_id');
    expect(setCalls).toHaveLength(2);

    // 2 Kanban POSTs + 2 block-append PATCHes (one per item).
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const pageCreates = fetchMock.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].endsWith('/v1/pages'));
    expect(pageCreates).toHaveLength(2);
    const blockAppends = fetchMock.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].includes('/v1/blocks/call-page-1/children'));
    expect(blockAppends).toHaveLength(2);
  });

  it('continues processing other items when one ns_create_action_item_from_call fails', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          action_items: [
            { title: 'OK Item', owner: 'Kyle' },
            { title: 'Fail Item', owner: 'Keenan' },
          ],
        }),
      }],
    });
    let n = 0;
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'ns_create_action_item_from_call') {
        n++;
        if (n === 2) return { data: null, error: { message: 'unique violation' } };
        return { data: 'ai-1', error: null };
      }
      return { data: null, error: null };
    });

    const { runActionItemExtraction } = await import('../../lib/calls-action-item-flow');
    const r = await runActionItemExtraction({
      call_id: 'c1',
      call_notion_page_id: 'cp',
      call_notion_url: 'u',
      call_title: 't',
      transcript_text: 'transcript',
      participants: [],
    });
    expect(r.extracted_count).toBe(2);
    expect(r.written_action_items).toHaveLength(1);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
    expect(r.errors[0]).toMatch(/Fail Item/);
  });

  it('captures an error and keeps the row when the Kanban card create fails', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({ action_items: [{ title: 'X', owner: 'Kyle' }] }),
      }],
    });
    mockRpc.mockResolvedValue({ data: 'ai-1', error: null });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/pages')) {
        return { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    }) as unknown as typeof fetch;

    const { runActionItemExtraction } = await import('../../lib/calls-action-item-flow');
    const r = await runActionItemExtraction({
      call_id: 'c1',
      call_notion_page_id: 'cp',
      call_notion_url: 'u',
      call_title: 't',
      transcript_text: 'transcript',
      participants: [],
    });
    expect(r.extracted_count).toBe(1);
    expect(r.written_action_items).toHaveLength(1);
    expect(r.written_action_items[0].notion_page_id).toBeNull();
    expect(r.errors.some((e) => e.includes('kanban-create'))).toBe(true);
  });
});
