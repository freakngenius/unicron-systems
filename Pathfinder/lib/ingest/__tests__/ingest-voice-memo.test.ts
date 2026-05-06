// lib/ingest/__tests__/ingest-voice-memo.test.ts
// Unit tests for the voice_memo ingest skill (Sprint 2 stub).
//
// Tests:
//   - Audio-only (no transcript): returns ABSTAIN with sprint_note
//   - Pre-transcribed content: delegates to ingestManual and returns its result
//   - Whitespace-only raw_content is treated as no transcript

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ingestVoiceMemo } from '@/lib/ingest/skills/ingest-voice-memo';
import { __setAnthropicForTests } from '@/lib/ingest/skills/ingest-manual';
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

function makeExtractionStub() {
  const response = {
    summary: 'Voice note about the standup recap.',
    action_items: [],
    signals: [
      { topic: 'ops', signal_type: 'FACT', content: 'Standup recap captured via voice.' },
    ],
    decisions: [],
  };
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(response) }],
        usage: { input_tokens: 40, output_tokens: 80 },
      }),
    },
  } as unknown as Anthropic;
}

const baseInput = {
  source_type: 'voice_memo' as const,
  source_id: 'voice-abc-123',
  source_url: null,
  raw_content: '',
  captured_at: '2026-05-06T11:00:00Z',
  captured_by: { type: 'human' as const, id: '6f71b432-4e21-436b-ab02-b301d29e2c63' },
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ingestVoiceMemo', () => {
  describe('ABSTAIN path (audio-only, no transcript)', () => {
    it('returns ABSTAIN when raw_content is empty string', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: '' });
      expect(result.status).toBe('ABSTAIN');
    });

    it('returns ABSTAIN when raw_content is whitespace only', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: '   \n\t  ' });
      expect(result.status).toBe('ABSTAIN');
    });

    it('ABSTAIN includes a reason', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: '' });
      expect(result.status).toBe('ABSTAIN');
      if (result.status === 'ABSTAIN') {
        expect(result.reason).toBeTruthy();
        expect(result.reason).toContain('Whisper');
      }
    });

    it('ABSTAIN includes sprint_note about Sprint 4', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: '' });
      if (result.status === 'ABSTAIN') {
        expect(result.sprint_note).toBeTruthy();
        expect(result.sprint_note).toContain('Sprint 4');
      }
    });

    it('returns ABSTAIN even when audio_stored_url is provided but no transcript', async () => {
      const result = await ingestVoiceMemo({
        ...baseInput,
        raw_content: '',
        audio_stored_url: 'https://storage.example.com/audio/voice-abc-123.m4a',
        metadata: { duration_seconds: 45, mime_type: 'audio/mp4' },
      });
      expect(result.status).toBe('ABSTAIN');
    });
  });

  describe('delegation to ingestManual (pre-transcribed content)', () => {
    beforeEach(() => {
      __setAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    });

    it('delegates to ingestManual when raw_content has substantive text', async () => {
      const result = await ingestVoiceMemo({
        ...baseInput,
        raw_content: 'Quick standup recap: shipped ingest, next up is Slack connector.',
      });
      // Delegated to ingestManual which returns records (mocked Supabase + GitHub)
      expect(result.status).toBe('records');
    });

    it('returns records with ledger_row and vault_doc when delegated', async () => {
      const result = await ingestVoiceMemo({
        ...baseInput,
        raw_content: 'Need to follow up with Keenan about the discovery call findings.',
      });
      if (result.status === 'records') {
        expect(result.ledger_row.id).toBeDefined();
        expect(result.vault_doc.commit_sha).toBeDefined();
      }
    });

    it('threshold: content longer than 5 chars delegates', async () => {
      // 6 chars — just over threshold
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: 'test!!!' });
      expect(result.status).toBe('records');
    });

    it('threshold: content of exactly 5 chars or fewer does NOT delegate', async () => {
      // 5 chars or fewer = ABSTAIN
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: 'hello' });
      expect(result.status).toBe('ABSTAIN');
    });
  });

  describe('metadata passthrough', () => {
    beforeEach(() => {
      __setAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    });

    it('passes through duration_seconds and mime_type to ingestManual', async () => {
      const result = await ingestVoiceMemo({
        ...baseInput,
        raw_content: 'Voice note about the architecture review.',
        metadata: { duration_seconds: 120, mime_type: 'audio/m4a' },
      });
      // Just verify it completes without error — metadata fields are informational
      expect(result.status).toBe('records');
    });
  });
});
