// lib/ingest/__tests__/taboo-keeper.test.ts
// Unit tests for the Taboo Keeper.
// Mocks Anthropic and the taboos fetch; verifies pass/bounce/timeout scenarios.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

// We import the module under test after setting up mocks
import {
  validateAction,
  __setFetchOverrideForTests,
  __setAnthropicForTests,
} from '@/lib/taboo-keeper';

// ─── Helpers ─────────────────────────────────────────────────────────────

const SAMPLE_TABOOS = `# Unicron Taboos

- Never delete production data without an explicit operator confirmation token.
- Never send emails to external parties without human review.
- Never expose API keys or credentials in logs.
`;

function makeFakeTabooFetch(content: string = SAMPLE_TABOOS) {
  return async (_url: string) => content;
}

function makeAnthropicStub(responseJson: object): Anthropic {
  const text = JSON.stringify(responseJson);
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  } as unknown as Anthropic;
}

const sampleAction = {
  action_type: 'send_slack_message',
  target: '#general',
  payload: { message: 'Hello team' },
  requested_by: { type: 'human' as const, id: 'abc123', name: 'Kyle' },
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('validateAction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __setFetchOverrideForTests(makeFakeTabooFetch());
    // Stub supabase so audit_log writes don't throw
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    __setFetchOverrideForTests(null);
    __setAnthropicForTests(null);
    vi.unstubAllEnvs();
  });

  it('returns pass verdict when Anthropic says pass', async () => {
    __setAnthropicForTests(makeAnthropicStub({ verdict: 'pass' }));

    const result = await validateAction(sampleAction);
    expect(result.verdict).toBe('pass');
  });

  it('returns bounce verdict with reason and matched_taboo', async () => {
    __setAnthropicForTests(
      makeAnthropicStub({
        verdict: 'bounce',
        reason: 'Action would send emails without human review',
        matched_taboo: 'Never send emails to external parties without human review.',
      })
    );

    const result = await validateAction({
      ...sampleAction,
      action_type: 'send_email',
      target: 'external@example.com',
    });

    expect(result.verdict).toBe('bounce');
    expect(result.reason).toContain('email');
    expect(result.matched_taboo).toBeDefined();
  });

  it('returns pass with warning on timeout', async () => {
    // Make the fetch hang forever
    __setFetchOverrideForTests(async (_url: string) => {
      await new Promise(() => {}); // never resolves
      return '';
    });
    __setAnthropicForTests(null);

    // Start the validation (don't await yet)
    const promise = validateAction(sampleAction);

    // Advance timers past the 2-second budget
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.verdict).toBe('pass');
    expect(result.warning).toBe('taboo_keeper_timeout');
  });

  it('returns pass with warning when Anthropic throws', async () => {
    __setAnthropicForTests({
      messages: {
        create: vi.fn().mockRejectedValue(new Error('API unavailable')),
      },
    } as unknown as Anthropic);

    const result = await validateAction(sampleAction);
    expect(result.verdict).toBe('pass');
    expect(result.warning).toBe('taboo_keeper_error');
  });

  it('handles markdown-fenced JSON response', async () => {
    const text = '```json\n{"verdict":"pass"}\n```';
    __setAnthropicForTests({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text }],
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
      },
    } as unknown as Anthropic);

    const result = await validateAction(sampleAction);
    expect(result.verdict).toBe('pass');
  });

  it('caches taboos on second call without re-fetching', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(SAMPLE_TABOOS);
    __setFetchOverrideForTests(fetchSpy);
    __setAnthropicForTests(makeAnthropicStub({ verdict: 'pass' }));

    await validateAction(sampleAction);
    await validateAction(sampleAction);

    // Should only fetch once (cache TTL is 5 minutes)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
