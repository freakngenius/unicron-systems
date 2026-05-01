// Unit tests for the LLM gateway — Phase 1 G1 Task A5.
//
// Covers routing (anthropic vs sonar by model), one-shot run(), streaming
// runStream(), error translation, and that recorder is invoked. Recorder
// writes are mocked at the module level so tests don't touch Supabase.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the recorder before importing run.ts so the gateway's import binds
// to the mock.
const mockRecord = vi.fn();
vi.mock('@/lib/llm/recorder', () => ({
  recordLLMCall: (...args: unknown[]) => mockRecord(...args),
}));

import {
  run,
  runStream,
  setAnthropicClientForTesting,
  setSonarFetchForTesting,
} from '@/lib/llm/run';

describe('lib/llm/run — model routing', () => {
  afterEach(() => {
    setAnthropicClientForTesting(null);
    setSonarFetchForTesting(null);
    mockRecord.mockReset();
  });

  it('throws on unknown model family', async () => {
    await expect(
      run({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
        surface: 'test',
      }),
    ).rejects.toThrow(/Unknown model family/);
  });
});

describe('lib/llm/run — Anthropic path', () => {
  beforeEach(() => {
    setAnthropicClientForTesting({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'hello world' }],
          usage: { input_tokens: 100, output_tokens: 5 },
        }),
        stream: vi.fn(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });
  afterEach(() => {
    setAnthropicClientForTesting(null);
    mockRecord.mockReset();
  });

  it('returns content + usage and records the call', async () => {
    const res = await run({
      model: 'claude-sonnet-4-6',
      systemPrompt: 'you are a test',
      messages: [{ role: 'user', content: 'say hello' }],
      surface: 'cron',
      agentName: 'ranker',
      agentRunId: 42,
    });
    expect(res.content).toBe('hello world');
    expect(res.model).toBe('claude-sonnet-4-6');
    expect(res.usage.inputTokens).toBe(100);
    expect(res.usage.outputTokens).toBe(5);
    expect(res.usage.costUsd).toBeGreaterThan(0);
    expect(res.usage.latencyMs).toBeGreaterThanOrEqual(0);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    const arg = mockRecord.mock.calls[0][0];
    expect(arg).toMatchObject({
      model: 'claude-sonnet-4-6',
      surface: 'cron',
      agentName: 'ranker',
      agentRunId: 42,
      inputTokens: 100,
      outputTokens: 5,
    });
  });
});

describe('lib/llm/run — Sonar path', () => {
  beforeEach(() => {
    process.env.PERPLEXITY_API_KEY = 'test-key';
    setSonarFetchForTesting(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'sonar replied' } }],
          citations: ['https://example.com/a', 'https://www.example.org/b'],
          model: 'sonar',
          usage: { prompt_tokens: 50, completion_tokens: 10 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
  });
  afterEach(() => {
    setSonarFetchForTesting(null);
    mockRecord.mockReset();
  });

  it('returns content + citations + usage and records the call', async () => {
    const res = await run({
      model: 'sonar',
      systemPrompt: 'you are a researcher',
      messages: [{ role: 'user', content: 'what is the weather' }],
      surface: 'chat',
      agentName: 'chat',
    });
    expect(res.content).toBe('sonar replied');
    expect(res.citations?.length).toBe(2);
    expect(res.citations?.[0].url).toBe('https://example.com/a');
    expect(res.citations?.[0].title).toBe('example.com');
    expect(res.citations?.[1].title).toBe('example.org');
    expect(res.usage.inputTokens).toBe(50);
    expect(res.usage.outputTokens).toBe(10);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    const arg = mockRecord.mock.calls[0][0];
    expect(arg.surface).toBe('chat');
    expect(arg.model).toBe('sonar');
  });

  it('throws a descriptive error on non-200 from Sonar', async () => {
    setSonarFetchForTesting(async () => new Response('bad request', { status: 400 }));
    await expect(
      run({
        model: 'sonar',
        messages: [{ role: 'user', content: 'q' }],
        surface: 'chat',
      }),
    ).rejects.toThrow(/Sonar request failed status=400/);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

describe('lib/llm/run — Anthropic stream path', () => {
  afterEach(() => {
    setAnthropicClientForTesting(null);
    mockRecord.mockReset();
  });

  it('yields delta events, emits usage + done, and records the call', async () => {
    const fakeEvents = [
      {
        type: 'message_start',
        message: { usage: { input_tokens: 30, cache_read_input_tokens: 0 } },
      },
      {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'one ' },
      },
      {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'two' },
      },
      { type: 'message_delta', usage: { output_tokens: 2 } },
    ];
    setAnthropicClientForTesting({
      messages: {
        stream: () => ({
          [Symbol.asyncIterator]: () => {
            let i = 0;
            return {
              async next() {
                if (i < fakeEvents.length) return { value: fakeEvents[i++], done: false };
                return { value: undefined, done: true };
              },
            };
          },
        }),
        create: vi.fn(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const events: unknown[] = [];
    for await (const e of runStream({
      model: 'claude-sonnet-4-6',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'go' }],
      surface: 'cron',
      agentName: 'ranker',
    })) {
      events.push(e);
    }

    const deltas = events.filter((e): e is { type: 'delta'; text: string } => (e as { type: string }).type === 'delta');
    expect(deltas.map((d) => d.text).join('')).toBe('one two');
    const usage = events.find((e): e is { type: 'usage'; usage: { inputTokens: number } } => (e as { type: string }).type === 'usage');
    expect(usage?.usage.inputTokens).toBe(30);
    expect(events[events.length - 1]).toEqual({ type: 'done' });

    expect(mockRecord).toHaveBeenCalledTimes(1);
  });
});
