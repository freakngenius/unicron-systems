// lib/ingest/__tests__/ingest-voice-memo.test.ts
// Unit tests for the voice_memo ingest skill (Sprint 4 — Whisper pipeline).
//
// Tests:
//   - Audio buffer provided → Whisper called → transcript extracted → ingestCall dispatched
//   - Audio URL provided → Whisper called → transcript extracted → ingestCall dispatched
//   - No audio, no raw_content → ABSTAIN
//   - OPENAI_API_KEY not set → ABSTAIN with reason
//   - Whisper API error → ABSTAIN with reason (no throw)
//   - Whisper returns empty transcript → ABSTAIN
//   - Pre-transcribed content → delegates to ingestManual
//   - Whitespace-only raw_content treated as no transcript

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ingestVoiceMemo, __setFetchForVoiceMemoTests } from '@/lib/ingest/skills/ingest-voice-memo';
import { __setAnthropicForTests as __setCallAnthropicForTests } from '@/lib/ingest/skills/ingest-call';
import { __setAnthropicForTests } from '@/lib/ingest/skills/ingest-manual';
import { __setSupabaseForTests, __setFetchForTests } from '@/lib/ingest/base';

// ─── Env stubs ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
  vi.stubEnv('GITHUB_TOKEN', 'test-github-token');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
});

afterEach(() => {
  __setAnthropicForTests(null);
  __setCallAnthropicForTests(null);
  __setSupabaseForTests(null);
  __setFetchForTests(null);
  __setFetchForVoiceMemoTests(null);
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
    insights: [
      { text: 'Standup recap captured via voice.', confidence: 0.8, candidate_for_memory: false },
    ],
    overall_confidence: 0.8,
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

/**
 * Build a fetch mock that handles:
 *   1. Whisper API call (POST to openai.com/v1/audio/transcriptions) → returns transcript
 *   2. GitHub GET (check file existence) → 404
 *   3. GitHub PUT (write vault doc) → 200 with commit sha
 */
function makeWhisperAndGithubFetchMock(transcript = 'Quick standup recap: shipped ingest, next up is Slack connector.') {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('openai.com/v1/audio/transcriptions')) {
      return {
        ok: true,
        json: async () => ({ text: transcript }),
      };
    }
    if (url.includes('api.github.com') && (!init?.method || init.method === 'GET')) {
      return { ok: false, status: 404 };
    }
    if (url.includes('api.github.com') && init?.method === 'PUT') {
      return {
        ok: true,
        json: async () => ({ commit: { sha: 'commit-sha-abc' } }),
      };
    }
    return { ok: false, status: 500 };
  });
}

/**
 * Build a fetch mock where the Whisper call returns an error.
 */
function makeWhisperErrorFetchMock(status = 500) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('openai.com/v1/audio/transcriptions')) {
      return {
        ok: false,
        status,
        text: async () => 'Internal server error',
      };
    }
    return { ok: false, status: 404 };
  });
}

const baseInput = {
  source_type: 'voice_memo' as const,
  source_id: 'voice-abc-123',
  source_url: null,
  raw_content: '',
  captured_at: '2026-05-06T11:00:00Z',
  captured_by: { type: 'human' as const, id: '6f71b432-4e21-436b-ab02-b301d29e2c63' },
};

const fakeAudioBuffer = Buffer.from('fake-audio-data');

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ingestVoiceMemo', () => {

  // ── ABSTAIN: no audio, no transcript ─────────────────────────────────────

  describe('ABSTAIN path (no audio, no transcript)', () => {
    it('returns ABSTAIN when raw_content is empty string and no audio', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: '' });
      expect(result.status).toBe('ABSTAIN');
    });

    it('returns ABSTAIN when raw_content is whitespace only and no audio', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: '   \n\t  ' });
      expect(result.status).toBe('ABSTAIN');
    });

    it('ABSTAIN includes a reason', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: '' });
      expect(result.status).toBe('ABSTAIN');
      if (result.status === 'ABSTAIN') {
        expect(result.reason).toBeTruthy();
      }
    });

    it('ABSTAIN includes sprint_note', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: '' });
      if (result.status === 'ABSTAIN') {
        expect(result.sprint_note).toBeTruthy();
      }
    });
  });

  // ── ABSTAIN: OPENAI_API_KEY not set ───────────────────────────────────────

  describe('ABSTAIN path (OPENAI_API_KEY not configured)', () => {
    it('returns ABSTAIN with "OPENAI_API_KEY not configured" when key is missing', async () => {
      vi.stubEnv('OPENAI_API_KEY', '');
      const result = await ingestVoiceMemo({
        ...baseInput,
        audio_buffer: fakeAudioBuffer,
        metadata: { mime_type: 'audio/m4a' },
      });
      expect(result.status).toBe('ABSTAIN');
      if (result.status === 'ABSTAIN') {
        expect(result.reason).toContain('OPENAI_API_KEY not configured');
      }
    });
  });

  // ── ABSTAIN: Whisper API error ────────────────────────────────────────────

  describe('ABSTAIN path (Whisper API error)', () => {
    it('returns ABSTAIN (no throw) when Whisper API returns error', async () => {
      __setFetchForVoiceMemoTests(makeWhisperErrorFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
      const result = await ingestVoiceMemo({
        ...baseInput,
        audio_buffer: fakeAudioBuffer,
        metadata: { mime_type: 'audio/m4a' },
      });
      expect(result.status).toBe('ABSTAIN');
      if (result.status === 'ABSTAIN') {
        expect(result.reason).toBeTruthy();
      }
    });

    it('does not throw — returns ABSTAIN gracefully on Whisper 500', async () => {
      __setFetchForVoiceMemoTests(makeWhisperErrorFetchMock(500) as unknown as (url: string, init?: RequestInit) => Promise<Response>);
      await expect(
        ingestVoiceMemo({
          ...baseInput,
          audio_buffer: fakeAudioBuffer,
          metadata: { mime_type: 'audio/m4a' },
        })
      ).resolves.toMatchObject({ status: 'ABSTAIN' });
    });
  });

  // ── Whisper path: audio_buffer → ingestCall ───────────────────────────────

  describe('Whisper transcription path (audio_buffer)', () => {
    beforeEach(() => {
      // ingestCall uses its own Anthropic seam
      __setCallAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
      // Whisper fetch via voice-memo module's own seam; GitHub fetch via base seam
      __setFetchForVoiceMemoTests(makeWhisperAndGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    });

    it('calls Whisper when audio_buffer is provided and returns records', async () => {
      const result = await ingestVoiceMemo({
        ...baseInput,
        audio_buffer: fakeAudioBuffer,
        metadata: { mime_type: 'audio/m4a' },
      });
      expect(result.status).toBe('records');
    });

    it('returns records with ledger_row and vault_doc', async () => {
      const result = await ingestVoiceMemo({
        ...baseInput,
        audio_buffer: fakeAudioBuffer,
        metadata: { mime_type: 'audio/m4a' },
      });
      if (result.status === 'records') {
        expect(result.ledger_row.id).toBeDefined();
        expect(result.vault_doc.commit_sha).toBeDefined();
      }
    });

    it('returns records with action_items array', async () => {
      const result = await ingestVoiceMemo({
        ...baseInput,
        audio_buffer: fakeAudioBuffer,
        metadata: { mime_type: 'audio/m4a' },
      });
      if (result.status === 'records') {
        expect(Array.isArray(result.action_items)).toBe(true);
      }
    });

    it('calls the Whisper API endpoint', async () => {
      const fetchMock = makeWhisperAndGithubFetchMock();
      __setFetchForVoiceMemoTests(fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>);

      await ingestVoiceMemo({
        ...baseInput,
        audio_buffer: fakeAudioBuffer,
        metadata: { mime_type: 'audio/m4a' },
      });

      const whisperCall = fetchMock.mock.calls.find(
        (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('openai.com/v1/audio/transcriptions')
      );
      expect(whisperCall).toBeDefined();
    });
  });

  // ── Whisper path: audio_stored_url → ingestCall ──────────────────────────

  describe('Whisper transcription path (audio_stored_url)', () => {
    beforeEach(() => {
      // ingestCall uses its own Anthropic seam
      __setCallAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
    });

    it('fetches audio from URL when audio_stored_url provided (no audio_buffer)', async () => {
      const transcript = 'Follow up with Keenan about the discovery call.';
      // Voice-memo module handles: audio URL fetch + Whisper API
      const voiceMemoFetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('storage.example.com')) {
          return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
          };
        }
        if (url.includes('openai.com/v1/audio/transcriptions')) {
          return { ok: true, json: async () => ({ text: transcript }) };
        }
        return { ok: false, status: 500 };
      });
      __setFetchForVoiceMemoTests(voiceMemoFetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>);

      // Base module handles: GitHub writes
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);

      const result = await ingestVoiceMemo({
        ...baseInput,
        audio_stored_url: 'https://storage.example.com/audio/voice-abc-123.m4a',
        metadata: { duration_seconds: 45, mime_type: 'audio/mp4' },
      });

      expect(result.status).toBe('records');
    });
  });

  // ── Whisper returns empty transcript ──────────────────────────────────────

  describe('ABSTAIN when Whisper returns empty transcript', () => {
    it('returns ABSTAIN when Whisper API returns empty text', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('openai.com/v1/audio/transcriptions')) {
          return { ok: true, json: async () => ({ text: '' }) };
        }
        return { ok: false, status: 404 };
      });
      __setFetchForVoiceMemoTests(fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>);

      const result = await ingestVoiceMemo({
        ...baseInput,
        audio_buffer: fakeAudioBuffer,
        metadata: { mime_type: 'audio/m4a' },
      });
      expect(result.status).toBe('ABSTAIN');
    });
  });

  // ── Pre-transcribed content → ingestManual ────────────────────────────────

  describe('delegation to ingestManual (pre-transcribed content, no audio)', () => {
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
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: 'test!!!' });
      expect(result.status).toBe('records');
    });

    it('threshold: content of exactly 5 chars or fewer does NOT delegate', async () => {
      const result = await ingestVoiceMemo({ ...baseInput, raw_content: 'hello' });
      expect(result.status).toBe('ABSTAIN');
    });
  });

  // ── audio_buffer takes priority over raw_content ──────────────────────────

  describe('audio_buffer takes priority over raw_content', () => {
    beforeEach(() => {
      __setCallAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    });

    it('uses Whisper (not ingestManual) when both audio_buffer and raw_content are set', async () => {
      const fetchMock = makeWhisperAndGithubFetchMock();
      __setFetchForVoiceMemoTests(fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>);

      const result = await ingestVoiceMemo({
        ...baseInput,
        audio_buffer: fakeAudioBuffer,
        raw_content: 'Already transcribed text that should be ignored.',
        metadata: { mime_type: 'audio/m4a' },
      });

      expect(result.status).toBe('records');
      // Verify Whisper was called (audio path, not manual path)
      const whisperCall = fetchMock.mock.calls.find(
        (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('openai.com/v1/audio/transcriptions')
      );
      expect(whisperCall).toBeDefined();
    });
  });

  // ── Metadata passthrough ──────────────────────────────────────────────────

  describe('metadata passthrough', () => {
    beforeEach(() => {
      __setAnthropicForTests(makeExtractionStub());
      __setSupabaseForTests(makeSupabaseMock() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>);
      __setFetchForTests(makeGithubFetchMock() as unknown as (url: string, init?: RequestInit) => Promise<Response>);
    });

    it('passes through duration_seconds and mime_type without error', async () => {
      const result = await ingestVoiceMemo({
        ...baseInput,
        raw_content: 'Voice note about the architecture review.',
        metadata: { duration_seconds: 120, mime_type: 'audio/m4a' },
      });
      expect(result.status).toBe('records');
    });
  });
});
