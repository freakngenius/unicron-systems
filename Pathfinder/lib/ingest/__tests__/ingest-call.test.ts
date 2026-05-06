// lib/ingest/__tests__/ingest-call.test.ts
// Unit tests for the call ingest skill.
// Mocks Anthropic, Supabase, and GitHub fetch; tests NO_SIGNAL/ABSTAIN/records paths.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ingestCall, __setAnthropicForTests } from '@/lib/ingest/skills/ingest-call';
import { __setSupabaseForTests, __setFetchForTests } from '@/lib/ingest/base';
import {
  __setAnthropicForTests as setTabooAnthropic,
  __setFetchOverrideForTests as setTabooFetch,
} from '@/lib/taboo-keeper';

// ─── Env stubs ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
  vi.stubEnv('GITHUB_TOKEN', 'test-github-token');
  vi.stubEnv('NOTION_API_KEY', 'test-notion-key');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});

afterEach(() => {
  __setAnthropicForTests(null);
  setTabooAnthropic(null);
  setTabooFetch(null);
  __setSupabaseForTests(null);
  __setFetchForTests(null);
  vi.unstubAllEnvs();
});

// ─── Mock builders ────────────────────────────────────────────────────────

function makeSupabaseMock() {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'ledger-uuid' }, error: null }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { title: 'Test action', description: null, priority: 'medium' },
            error: null,
          }),
        }),
        ilike: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [{ id: 'customer-uuid' }], error: null }),
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
  decisions: object[];
  action_items: object[];
  insights: object[];
  overall_confidence: number;
}> = {}) {
  const response = {
    summary: 'Discussion about Zedcor expansion plans and next steps.',
    decisions: [
      { text: 'Expand to Denver branch', evidence_quote: 'We agreed to move forward', confidence: 0.9 },
    ],
    action_items: [
      { title: 'Send proposal to Zedcor', description: 'Draft and send by EOW', priority: 'high', requested_by: 'Kyle', requested_of: 'Kyle' },
    ],
    insights: [
      { text: 'Zedcor is expanding rapidly', confidence: 0.85, candidate_for_memory: true },
    ],
    overall_confidence: 0.82,
    ...overrides,
  };
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(response) }],
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    },
  } as unknown as Anthropic;
}

const baseInput = {
  source_type: 'call' as const,
  source_id: 'call-abc-123',
  source_url: null,
  raw_content: 'Kyle: Hey, let us talk about the Zedcor expansion. We decided to move forward with Denver.',
  participants: [{ name: 'Kyle', team_member_id: '6f71b432-4e21-436b-ab02-b301d29e2c63' }],
  captured_at: '2026-05-06T10:00:00Z',
  captured_by: { type: 'human' as const, id: '6f71b432-4e21-436b-ab02-b301d29e2c63' },
  metadata: { customer_name: 'Zedcor', duration_seconds: 1800 },
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ingestCall', () => {
  describe('NO_SIGNAL', () => {
    it('returns NO_SIGNAL for empty transcript', async () => {
      const result = await ingestCall({ ...baseInput, raw_content: '' });
      expect(result.status).toBe('NO_SIGNAL');
      expect((result as { status: string; reason: string }).reason).toContain('empty');
    });

    it('returns NO_SIGNAL for whitespace-only transcript', async () => {
      const result = await ingestCall({ ...baseInput, raw_content: '   \n  ' });
      expect(result.status).toBe('NO_SIGNAL');
    });

    it('returns NO_SIGNAL when LLM returns null extraction', async () => {
      __setAnthropicForTests({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'not valid json at all' }],
            usage: { input_tokens: 5, output_tokens: 5 },
          }),
        },
      } as unknown as Anthropic);

      const result = await ingestCall(baseInput);
      expect(result.status).toBe('NO_SIGNAL');
    });
  });

  describe('ABSTAIN', () => {
    it('returns ABSTAIN when overall_confidence is below 0.5', async () => {
      __setAnthropicForTests(
        makeExtractionStub({ overall_confidence: 0.3, action_items: [], decisions: [] })
      );

      const result = await ingestCall(baseInput);
      expect(result.status).toBe('ABSTAIN');
      if (result.status === 'ABSTAIN') {
        expect(result.reason).toContain('0.30');
      }
    });

    it('returns ABSTAIN at exactly 0.49 confidence', async () => {
      __setAnthropicForTests(makeExtractionStub({ overall_confidence: 0.49 }));
      const result = await ingestCall(baseInput);
      expect(result.status).toBe('ABSTAIN');
    });
  });

  describe('records', () => {
    beforeEach(() => {
      __setAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    });

    it('returns records status with ledger_row, vault_doc, action_items, signals', async () => {
      const result = await ingestCall(baseInput);
      expect(result.status).toBe('records');
      if (result.status === 'records') {
        expect(result.ledger_row.id).toBeDefined();
        expect(result.vault_doc.commit_sha).toBeDefined();
        expect(Array.isArray(result.action_items)).toBe(true);
        expect(Array.isArray(result.signals)).toBe(true);
      }
    });

    it('passes at exactly 0.5 confidence threshold', async () => {
      __setAnthropicForTests(makeExtractionStub({ overall_confidence: 0.5 }));
      const result = await ingestCall(baseInput);
      expect(result.status).toBe('records');
    });

    it('includes signals from insights', async () => {
      const result = await ingestCall(baseInput);
      if (result.status === 'records') {
        expect(result.signals.length).toBeGreaterThan(0);
        expect(result.signals[0]).toMatchObject({
          topic: 'Zedcor',
          content: expect.any(String),
          strength: expect.any(Number),
        });
      }
    });

    it('vault doc path includes date and source_id', async () => {
      const fetchMock = makeGithubFetchMock();
      __setFetchForTests(fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>);

      await ingestCall(baseInput);

      // Find the PUT call
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
      const putCall = calls.find((c: unknown[]) => {
        const init = c[1] as RequestInit | undefined;
        return init && init.method === 'PUT';
      });
      expect(putCall).toBeDefined();
      const url = putCall?.[0] as string;
      expect(url).toContain('2026-05-06');
      expect(url).toContain('call-abc-123');
    });
  });

  describe('input validation', () => {
    it('throws on invalid source_type', async () => {
      await expect(
        ingestCall({ ...baseInput, source_type: 'email' as 'call' })
      ).rejects.toThrow();
    });

    it('throws on invalid captured_at (not ISO datetime)', async () => {
      await expect(
        ingestCall({ ...baseInput, captured_at: 'not-a-date' })
      ).rejects.toThrow();
    });
  });
});
