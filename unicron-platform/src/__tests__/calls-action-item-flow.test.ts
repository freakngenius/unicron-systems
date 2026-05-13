// src/__tests__/calls-action-item-flow.test.ts
// Tests for lib/calls-action-item-flow.ts — transcript fan-out pipeline.
//
// 2026-05-13 Bug Fix expansion: the LLM now also extracts decisions[] and
// customer_mentions[] alongside action_items[], and runActionItemExtraction
// fans those out via ns_create_decision_from_call + ns_link_call_customer_mentions
// in addition to the original action-item path.

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
  it('parses a valid LLM JSON response into the bundle', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({
      action_items: [
        { title: 'Send SOW', owner: 'Kyle', priority: 'high', outcome: 'SOW emailed', steps: ['Draft', 'Email'], due_iso: '2026-05-15', description: 'Pilot SOW' },
        { title: 'Schedule kickoff', owner: 'Co-Pilot', priority: 'medium', outcome: 'meeting scheduled', steps: ['Find times'], due_iso: null },
      ],
      decisions: [
        { decision: 'Use weekly cadence', decided_by: 'Kyle', rationale: 'matches sprint review' },
      ],
      customer_mentions: [
        { name: 'Zedcor', quote: 'Zedcor wants the pilot SOW', confidence: 0.95 },
      ],
    });
    const bundle = __internals.parseExtractionResponse(raw);
    expect(bundle.action_items).toHaveLength(2);
    expect(bundle.action_items[0].title).toBe('Send SOW');
    expect(bundle.action_items[0].priority).toBe('high');
    expect(bundle.action_items[1].owner).toBe('Co-Pilot');
    expect(bundle.decisions).toHaveLength(1);
    expect(bundle.decisions[0].decision).toBe('Use weekly cadence');
    expect(bundle.customer_mentions).toHaveLength(1);
    expect(bundle.customer_mentions[0].name).toBe('Zedcor');
  });

  it('extracts JSON even when wrapped in surrounding prose', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = 'Here are the action items: {"action_items":[{"title":"X","owner":"Kyle"}],"decisions":[],"customer_mentions":[]}\nThat\'s all.';
    const bundle = __internals.parseExtractionResponse(raw);
    expect(bundle.action_items).toHaveLength(1);
    expect(bundle.action_items[0].title).toBe('X');
  });

  it('returns empty bundle on malformed JSON', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    expect(__internals.parseExtractionResponse('not json at all')).toEqual({ action_items: [], decisions: [], customer_mentions: [] });
    expect(__internals.parseExtractionResponse('{ broken json')).toEqual({ action_items: [], decisions: [], customer_mentions: [] });
  });

  it('drops action items missing a title', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ action_items: [{ owner: 'Kyle' }, { title: 'OK', owner: 'Co-Pilot' }] });
    expect(__internals.parseExtractionResponse(raw).action_items).toHaveLength(1);
  });

  it('coerces invalid priority values to "medium"', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ action_items: [{ title: 'X', owner: 'Kyle', priority: 'critical' }] });
    expect(__internals.parseExtractionResponse(raw).action_items[0].priority).toBe('medium');
  });

  it('drops invalid due_iso values', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ action_items: [{ title: 'X', owner: 'Kyle', due_iso: 'next Friday' }] });
    expect(__internals.parseExtractionResponse(raw).action_items[0].due_iso).toBeNull();
  });

  it('defaults missing owner to "Co-Pilot"', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ action_items: [{ title: 'X' }] });
    expect(__internals.parseExtractionResponse(raw).action_items[0].owner).toBe('Co-Pilot');
  });

  it('deduplicates customer mentions by case-insensitive name', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({
      customer_mentions: [
        { name: 'Zedcor', quote: 'a', confidence: 0.9 },
        { name: 'zedcor', quote: 'b', confidence: 0.8 },
        { name: 'Acme Co', quote: 'c', confidence: 0.6 },
      ],
    });
    const bundle = __internals.parseExtractionResponse(raw);
    expect(bundle.customer_mentions).toHaveLength(2);
    expect(bundle.customer_mentions[0].name).toBe('Zedcor');
    expect(bundle.customer_mentions[1].name).toBe('Acme Co');
  });

  it('drops decisions missing decision text', async () => {
    const { __internals } = await import('../../lib/calls-action-item-flow');
    const raw = JSON.stringify({ decisions: [{ decided_by: 'Kyle' }, { decision: 'Ship Friday', decided_by: 'Kyle' }] });
    expect(__internals.parseExtractionResponse(raw).decisions).toHaveLength(1);
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
    expect(r.written_decisions).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns zero counts when the LLM finds nothing', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"action_items":[],"decisions":[],"customer_mentions":[]}' }],
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
    expect(r.extracted_counts).toEqual({ action_items: 0, decisions: 0, customer_mentions: 0 });
    expect(r.written_action_items).toEqual([]);
    expect(r.written_decisions).toEqual([]);
  });

  it('fans out action items + decisions + customer mentions', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          action_items: [
            { title: 'Send Zedcor SOW', owner: 'Kyle', priority: 'high', description: 'Pilot SOW' },
            { title: 'Draft FAQ', owner: 'Co-Pilot', priority: 'medium' },
          ],
          decisions: [
            { decision: 'Use weekly cadence', decided_by: 'Kyle', rationale: 'matches sprint review' },
          ],
          customer_mentions: [
            { name: 'Zedcor', quote: 'Zedcor wants the pilot SOW', confidence: 0.95 },
          ],
        }),
      }],
    });

    let aiCounter = 0;
    let decisionCounter = 0;
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'ns_create_action_item_from_call') {
        aiCounter++;
        return { data: `ai-${aiCounter}`, error: null };
      }
      if (name === 'ns_create_decision_from_call') {
        decisionCounter++;
        return { data: `dec-${decisionCounter}`, error: null };
      }
      if (name === 'ns_link_call_customer_mentions') {
        return {
          data: {
            resolved: [{ name: 'Zedcor', customer_id: 'cust-1', customer_name: 'Zedcor', quote: 'q', confidence: 0.95 }],
            unresolved: [],
            dominant_customer_id: 'cust-1',
            dominant_customer_name: 'Zedcor',
            count_resolved: 1,
            count_unresolved: 0,
          },
          error: null,
        };
      }
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
      uploaded_by: 'kyle@unicron.systems',
    });

    expect(r.extracted_counts).toEqual({ action_items: 2, decisions: 1, customer_mentions: 1 });
    expect(r.written_action_items).toHaveLength(2);
    expect(r.written_decisions).toHaveLength(1);
    expect(r.customer_mentions_result.dominant_customer_name).toBe('Zedcor');
    expect(r.errors).toEqual([]);

    const aiCalls = mockRpc.mock.calls.filter(([n]) => n === 'ns_create_action_item_from_call');
    expect(aiCalls).toHaveLength(2);
    expect(aiCalls[0][1].p_owner_name).toBe('Kyle');
    expect(aiCalls[0][1].p_priority).toBe('high');

    const decCalls = mockRpc.mock.calls.filter(([n]) => n === 'ns_create_decision_from_call');
    expect(decCalls).toHaveLength(1);
    expect(decCalls[0][1].p_decision_text).toBe('Use weekly cadence');

    const cmCalls = mockRpc.mock.calls.filter(([n]) => n === 'ns_link_call_customer_mentions');
    expect(cmCalls).toHaveLength(1);
    expect(cmCalls[0][1].p_call_ledger_id).toBe('c1');

    // Notion kanban + back-link bullets — 2 page creates + 2 block appends.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const pageCreates = fetchMock.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].endsWith('/v1/pages'));
    expect(pageCreates).toHaveLength(2);
    for (const call of pageCreates) {
      const body = JSON.parse((call[1] as RequestInit & { body: string }).body);
      expect(body.properties.Status.select.name).toBe('Backlog');
      expect(['Low', 'Medium', 'High', 'Irreversible']).toContain(body.properties.Priority.select.name);
      expect(body.properties.Source.select.name).toBe('Call');
    }
    const blockAppends = fetchMock.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].includes('/v1/blocks/call-page-1/children'));
    expect(blockAppends).toHaveLength(2);
  });

  it('continues when one action-item RPC fails', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          action_items: [
            { title: 'OK Item', owner: 'Kyle' },
            { title: 'Fail Item', owner: 'Keenan' },
          ],
          decisions: [],
          customer_mentions: [],
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
    expect(r.extracted_counts.action_items).toBe(2);
    expect(r.written_action_items).toHaveLength(1);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
    expect(r.errors.some((e) => e.includes('Fail Item'))).toBe(true);
  });

  it('captures kanban-create errors without dropping the action_item row', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({ action_items: [{ title: 'X', owner: 'Kyle' }], decisions: [], customer_mentions: [] }),
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
    expect(r.extracted_counts.action_items).toBe(1);
    expect(r.written_action_items).toHaveLength(1);
    expect(r.written_action_items[0].notion_page_id).toBeNull();
    expect(r.errors.some((e) => e.includes('kanban-create'))).toBe(true);
  });
});
