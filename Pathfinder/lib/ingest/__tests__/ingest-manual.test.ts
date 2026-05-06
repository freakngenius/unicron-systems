// lib/ingest/__tests__/ingest-manual.test.ts
// Unit tests for the manual quick-capture ingest skill.
// Mocks Anthropic, Supabase, and GitHub fetch; tests NO_SIGNAL/records paths.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ingestManual, __setAnthropicForTests } from '@/lib/ingest/skills/ingest-manual';
import { __setSupabaseForTests, __setFetchForTests } from '@/lib/ingest/base';

// ─── Env stubs ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
  vi.stubEnv('GITHUB_TOKEN', 'test-github-token');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});

afterEach(() => {
  __setAnthropicForTests(null);
  __setSupabaseForTests(null);
  __setFetchForTests(null);
  vi.unstubAllEnvs();
});

// ─── Mock builders ────────────────────────────────────────────────────────

// Use real UUIDs so Zod validation inside createActionItem passes
const MOCK_LEDGER_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const MOCK_ACTION_ID = 'a1b2c3d4-0000-0000-0000-000000000002';

function makeSupabaseMock() {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn()
            .mockResolvedValueOnce({ data: { id: MOCK_LEDGER_ID }, error: null }) // ledger insert
            .mockResolvedValue({ data: { id: MOCK_ACTION_ID }, error: null }),    // action_item inserts
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { title: 'Test action', description: null, priority: 'medium' },
            error: null,
          }),
        }),
        or: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
}

function makeGithubFetchMock() {
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (!init || init.method !== 'PUT') {
      return { ok: false };
    }
    return {
      ok: true,
      json: async () => ({ commit: { sha: 'commit-sha-abc' } }),
    };
  });
}

function makeExtractionStub(overrides: Partial<{
  summary: string;
  action_items: object[];
  signals: object[];
  decisions: object[];
}> = {}) {
  const response = {
    summary: 'Kyle noted that the ingest pipeline is ready for testing.',
    action_items: [
      { title: 'Test ingest endpoint', description: 'Run curl against /api/ingest', priority: 'high', proposed_dri: 'Kyle', requested_by: 'Kyle', requested_of: 'Kyle' },
    ],
    signals: [
      { topic: 'engineering', signal_type: 'FACT', content: 'Ingest pipeline ready for Sprint 2 testing.' },
    ],
    decisions: [],
    ...overrides,
  };
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(response) }],
        usage: { input_tokens: 50, output_tokens: 150 },
      }),
    },
  } as unknown as Anthropic;
}

const baseInput = {
  source_type: 'manual' as const,
  source_id: 'manual-abc-123',
  source_url: null,
  raw_content: 'Need to test the ingest endpoint before Friday. Kyle owns this.',
  participants: [],
  captured_at: '2026-05-06T10:00:00Z',
  captured_by: { type: 'human' as const, id: '6f71b432-4e21-436b-ab02-b301d29e2c63' },
  metadata: { channel: 'atrium' as const },
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ingestManual', () => {
  describe('NO_SIGNAL', () => {
    it('returns NO_SIGNAL for empty content', async () => {
      const result = await ingestManual({ ...baseInput, raw_content: '' });
      expect(result.status).toBe('NO_SIGNAL');
      expect((result as { status: string; reason: string }).reason).toContain('short');
    });

    it('returns NO_SIGNAL for whitespace-only content', async () => {
      const result = await ingestManual({ ...baseInput, raw_content: '   \n  ' });
      expect(result.status).toBe('NO_SIGNAL');
    });

    it('returns NO_SIGNAL for content shorter than 5 chars', async () => {
      const result = await ingestManual({ ...baseInput, raw_content: 'hi' });
      expect(result.status).toBe('NO_SIGNAL');
    });

    it('returns NO_SIGNAL when model returns NO_SIGNAL status', async () => {
      __setAnthropicForTests({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({ status: 'NO_SIGNAL', reason: 'Nothing here' }) }],
            usage: { input_tokens: 10, output_tokens: 10 },
          }),
        },
      } as unknown as Anthropic);

      const result = await ingestManual(baseInput);
      expect(result.status).toBe('NO_SIGNAL');
      if (result.status === 'NO_SIGNAL') {
        expect(result.reason).toBe('Nothing here');
      }
    });

    it('returns NO_SIGNAL when LLM returns unparseable response', async () => {
      __setAnthropicForTests({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'sorry I cannot help with that' }],
            usage: { input_tokens: 5, output_tokens: 5 },
          }),
        },
      } as unknown as Anthropic);

      const result = await ingestManual(baseInput);
      expect(result.status).toBe('NO_SIGNAL');
    });
  });

  describe('records', () => {
    beforeEach(() => {
      __setAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    });

    it('returns records status for substantive content', async () => {
      const result = await ingestManual(baseInput);
      expect(result.status).toBe('records');
    });

    it('returns ledger_row, vault_doc, action_items, signals for substantive content', async () => {
      const result = await ingestManual(baseInput);
      if (result.status === 'records') {
        expect(result.ledger_row.id).toBeDefined();
        expect(result.vault_doc.commit_sha).toBeDefined();
        expect(Array.isArray(result.action_items)).toBe(true);
        expect(Array.isArray(result.signals)).toBe(true);
      }
    });

    it('creates action items from extracted data', async () => {
      const result = await ingestManual(baseInput);
      if (result.status === 'records') {
        expect(result.action_items.length).toBeGreaterThan(0);
        expect(result.action_items[0].id).toBeDefined();
      }
    });

    it('includes signals from extraction', async () => {
      const result = await ingestManual(baseInput);
      if (result.status === 'records') {
        expect(result.signals.length).toBeGreaterThan(0);
        expect(result.signals[0]).toMatchObject({
          topic: expect.any(String),
          signal_type: expect.any(String),
          content: expect.any(String),
          strength: expect.any(Number),
        });
      }
    });

    it('vault doc path includes date and truncated source_id', async () => {
      const fetchMock = makeGithubFetchMock();
      __setFetchForTests(fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>);

      await ingestManual(baseInput);

      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
      const putCall = calls.find((c: unknown[]) => {
        const init = c[1] as RequestInit | undefined;
        return init && init.method === 'PUT';
      });
      expect(putCall).toBeDefined();
      const url = putCall?.[0] as string;
      expect(url).toContain('raw/inbox');
      expect(url).toContain('2026-05-06');
      // source_id.slice(0,8) = 'manual-a'
      expect(url).toContain('manual-a');
    });

    it('handles extraction with empty action_items gracefully', async () => {
      __setAnthropicForTests(makeExtractionStub({ action_items: [] }));
      const result = await ingestManual(baseInput);
      expect(result.status).toBe('records');
      if (result.status === 'records') {
        expect(result.action_items).toHaveLength(0);
      }
    });

    it('handles extraction with empty signals gracefully', async () => {
      __setAnthropicForTests(makeExtractionStub({ signals: [] }));
      const result = await ingestManual(baseInput);
      expect(result.status).toBe('records');
      if (result.status === 'records') {
        expect(result.signals).toHaveLength(0);
      }
    });
  });

  describe('channel metadata', () => {
    beforeEach(() => {
      __setAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    });

    it('accepts atrium channel', async () => {
      const result = await ingestManual({ ...baseInput, metadata: { channel: 'atrium' } });
      expect(result.status).toBe('records');
    });

    it('accepts slack channel', async () => {
      const result = await ingestManual({ ...baseInput, metadata: { channel: 'slack' } });
      expect(result.status).toBe('records');
    });

    it('defaults channel to atrium when metadata is missing', async () => {
      const result = await ingestManual({ ...baseInput, metadata: undefined });
      expect(result.status).toBe('records');
    });
  });
});
