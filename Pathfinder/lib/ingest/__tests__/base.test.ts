// lib/ingest/__tests__/base.test.ts
// Unit tests for the ingest base library.
// Mocks Supabase and GitHub API; tests each function's contract.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  writeLedgerRow,
  writeVaultDoc,
  createActionItem,
  dispatchKanbanCard,
  validateWithTabooKeeper,
  __setSupabaseForTests,
  __setFetchForTests,
} from '@/lib/ingest/base';
import {
  __setAnthropicForTests as setTabooAnthropic,
  __setFetchOverrideForTests as setTabooFetch,
} from '@/lib/taboo-keeper';
import type Anthropic from '@anthropic-ai/sdk';

// ─── Supabase mock builder ─────────────────────────────────────────────────

function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  const defaultInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: 'mock-uuid-1234' }, error: null }),
    }),
  });
  const defaultSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { title: 'Test action', description: 'desc', priority: 'medium' },
        error: null,
      }),
    }),
    ilike: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'customer-uuid' }], error: null }),
    }),
    or: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
  const defaultUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  return {
    from: vi.fn().mockReturnValue({
      insert: overrides.insert ?? defaultInsert,
      select: overrides.select ?? defaultSelect,
      update: overrides.update ?? defaultUpdate,
    }),
    ...overrides,
  };
}

// ─── GitHub fetch mock ────────────────────────────────────────────────────

function makeGithubFetchMock(commitSha: string = 'abc123def456') {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (!init || init.method !== 'PUT') {
      // GET (check if file exists) — 404 = new file
      return { ok: false, json: async () => ({}) };
    }
    return {
      ok: true,
      json: async () => ({ commit: { sha: commitSha } }),
    };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('writeLedgerRow', () => {
  beforeEach(() => {
    __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
  });
  afterEach(() => {
    __setSupabaseForTests(null);
  });

  it('inserts a ledger row and returns its id', async () => {
    const result = await writeLedgerRow({ source_type: 'call' });
    expect(result.id).toBe('mock-uuid-1234');
  });

  it('throws when Supabase returns an error', async () => {
    __setSupabaseForTests(
      makeSupabaseMock({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
          }),
        }),
      }) as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>
    );
    await expect(writeLedgerRow({ source_type: 'call' })).rejects.toThrow('insert failed');
  });

  it('validates source_type against allowed values', async () => {
    await expect(
      writeLedgerRow({ source_type: 'bad_type' as 'call' })
    ).rejects.toThrow();
  });
});

describe('writeVaultDoc', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
  });
  afterEach(() => {
    __setFetchForTests(null);
    vi.unstubAllEnvs();
  });

  it('commits a new file and returns commit_sha', async () => {
    __setFetchForTests(makeGithubFetchMock('sha-abcdef') as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    const result = await writeVaultDoc(
      'Calls/2026-05-06-test.md',
      'transcript content',
      { source_type: 'call', captured_at: '2026-05-06T00:00:00Z' }
    );
    expect(result.commit_sha).toBe('sha-abcdef');
  });

  it('throws when GITHUB_TOKEN is missing', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GITHUB_TOKEN', '');
    await expect(
      writeVaultDoc('test.md', 'content', {})
    ).rejects.toThrow('GITHUB_TOKEN is not set');
  });

  it('throws when GitHub PUT returns non-OK', async () => {
    __setFetchForTests(
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'unprocessable' }) as unknown as (url: string, init?: RequestInit) => Promise<Response>
    );
    await expect(
      writeVaultDoc('test.md', 'content', {})
    ).rejects.toThrow('GitHub PUT failed');
  });
});

describe('createActionItem', () => {
  beforeEach(() => {
    __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
  });
  afterEach(() => {
    __setSupabaseForTests(null);
  });

  it('inserts an action item and returns id', async () => {
    const result = await createActionItem({
      title: 'Follow up with Zedcor',
      requested_by: { type: 'human', id: 'kyle-uuid', name: 'Kyle' },
      requested_of: { type: 'human', id: 'kyle-uuid', name: 'Kyle' },
    });
    expect(result.id).toBe('mock-uuid-1234');
  });

  it('throws on missing required fields (title)', async () => {
    await expect(
      createActionItem({
        title: '',
        requested_by: { type: 'human', id: 'x', name: 'x' },
        requested_of: { type: 'human', id: 'x', name: 'x' },
      })
    ).rejects.toThrow();
  });
});

describe('dispatchKanbanCard', () => {
  beforeEach(() => {
    vi.stubEnv('NOTION_DB_INTERNAL_KANBAN', 'notion-db-id-123');
    __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
  });
  afterEach(() => {
    __setSupabaseForTests(null);
    __setFetchForTests(null);
    vi.unstubAllEnvs();
  });

  it('creates a Notion page and returns kanban_card_id', async () => {
    __setFetchForTests(
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'notion-page-id-xyz' }),
      }) as unknown as (url: string, init?: RequestInit) => Promise<Response>
    );
    vi.stubEnv('NOTION_API_KEY', 'notion-test-key');

    const result = await dispatchKanbanCard('action-item-uuid');
    expect(result.kanban_card_id).toBe('notion-page-id-xyz');
  });

  it('throws when NOTION_DB_INTERNAL_KANBAN is not set', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NOTION_DB_INTERNAL_KANBAN', '');
    await expect(dispatchKanbanCard('some-id')).rejects.toThrow('NOTION_DB_INTERNAL_KANBAN');
  });
});

describe('validateWithTabooKeeper', () => {
  afterEach(() => {
    setTabooAnthropic(null);
    setTabooFetch(null);
  });

  it('returns pass:true for a benign action', async () => {
    setTabooFetch(async () => '# Taboos\n- Never delete production data.\n');
    setTabooAnthropic({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"verdict":"pass"}' }],
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
      },
    } as unknown as Anthropic);

    const result = await validateWithTabooKeeper({
      action_type: 'write_slack_message',
      target: '#team',
      payload: {},
      requested_by: { type: 'human', id: 'kyle-uuid', name: 'Kyle' },
    });
    expect(result.pass).toBe(true);
  });

  it('returns pass:false with reason for a bounced action', async () => {
    setTabooFetch(async () => '# Taboos\n- Never delete production data.\n');
    setTabooAnthropic({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"verdict":"bounce","reason":"deletes prod data","matched_taboo":"Never delete production data."}' }],
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
      },
    } as unknown as Anthropic);

    const result = await validateWithTabooKeeper({
      action_type: 'delete_table',
      target: 'production_db',
      payload: {},
      requested_by: { type: 'agent', id: 'agent-uuid', name: 'Orchestrator' },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
