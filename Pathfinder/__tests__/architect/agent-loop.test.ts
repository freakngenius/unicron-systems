// __tests__/architect/agent-loop.test.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §2 (agent framing).
//
// Smoke + behavioral coverage for the Anthropic-Messages-API tool-use loop.
// Mocks the Anthropic client and asserts:
//   - model + tools + system prompt are forwarded
//   - tool handlers are invoked when the model calls them
//   - finalize tool terminates the loop and captures input
//   - cost tracking aggregates per-turn usage
//   - maxTurns / costCap / timeout produce the right terminal status
//   - unknown tool calls are surfaced to the model with is_error
//   - handler exceptions don't break the loop

import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  runAgentLoop,
  type AnthropicClient,
  type ToolDef,
} from '@/services/architect/runtime/agent-loop';

vi.mock('@/lib/llm/recorder', () => ({
  recordLLMCall: vi.fn(),
}));

function mockMessage(opts: {
  text?: string;
  toolUses?: { id: string; name: string; input: unknown }[];
  inputTokens?: number;
  outputTokens?: number;
  stop_reason?: 'end_turn' | 'tool_use';
}): Anthropic.Message {
  const content: Array<
    { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
  > = [];
  if (opts.text) content.push({ type: 'text', text: opts.text });
  for (const tu of opts.toolUses ?? []) {
    content.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
  }
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: content as unknown as Anthropic.ContentBlock[],
    stop_reason: opts.stop_reason ?? (opts.toolUses?.length ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    usage: {
      input_tokens: opts.inputTokens ?? 100,
      output_tokens: opts.outputTokens ?? 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: null,
      service_tier: 'standard',
    } as Anthropic.Usage,
  } as Anthropic.Message;
}

function makeMockClient(responses: Anthropic.Message[]): AnthropicClient {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const r = responses[i];
        if (!r) throw new Error('mock client exhausted');
        i += 1;
        return r;
      }),
    },
  };
}

const echoTool: ToolDef = {
  name: 'echo',
  description: 'Echoes its input',
  input_schema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
  handler: (input) => ({ echoed: input.msg }),
};

const finalize: ToolDef = {
  name: 'finalize',
  description: 'Terminates the loop',
  input_schema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] },
  handler: () => ({ finalized: true }),
};

describe('agent-loop — happy path', () => {
  it('terminates when finalize tool is called and captures the input', async () => {
    const client = makeMockClient([
      mockMessage({
        text: 'I will use echo first, then finalize.',
        toolUses: [{ id: 't1', name: 'echo', input: { msg: 'hi' } }],
      }),
      mockMessage({
        toolUses: [{ id: 't2', name: 'finalize', input: { result: 'done' } }],
      }),
    ]);

    const result = await runAgentLoop({
      systemPrompt: 'You are helpful.',
      initialUserMessage: 'Please echo "hi" then finalize.',
      tools: [echoTool, finalize],
      finalToolName: 'finalize',
      model: 'claude-sonnet-4-6',
      maxTurns: 5,
      costCapUsd: 1.5,
      timeoutMs: 60_000,
      sessionId: 'sess_test',
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: client,
    });

    expect(result.status).toBe('completed');
    expect(result.finalToolName).toBe('finalize');
    expect(result.finalToolInput).toEqual({ result: 'done' });
    expect(result.turns).toBe(2);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('passes system prompt + tools + messages to anthropic', async () => {
    // Snapshot the messages array at call-time. The loop mutates the
    // same array on subsequent turns, so referencing mock.calls[0][0]
    // after-the-fact would see the mutated state.
    let firstCallMessages: { role: string }[] | null = null;
    const create = vi.fn(async (args: unknown) => {
      const a = args as { messages: { role: string }[] };
      if (firstCallMessages === null) {
        firstCallMessages = a.messages.map((m) => ({ ...m }));
      }
      return mockMessage({
        toolUses: [{ id: 't1', name: 'finalize', input: { result: 'go' } }],
      });
    });
    const client: AnthropicClient = { messages: { create } };
    await runAgentLoop({
      systemPrompt: 'sysprompt-marker',
      initialUserMessage: 'user-marker',
      tools: [echoTool, finalize],
      finalToolName: 'finalize',
      model: 'claude-sonnet-4-6',
      maxTurns: 5,
      costCapUsd: 1.5,
      timeoutMs: 60_000,
      sessionId: 'sess_test',
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: client,
    });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0] as {
      system: string;
      model: string;
      tools: { name: string }[];
    };
    expect(args.system).toBe('sysprompt-marker');
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.tools.map((t) => t.name)).toContain('finalize');
    expect(args.tools.map((t) => t.name)).toContain('echo');
    expect(firstCallMessages).toEqual([{ role: 'user', content: 'user-marker' }]);
  });
});

describe('agent-loop — tool execution', () => {
  it('invokes the handler and threads the result back to the model', async () => {
    const handlerSpy = vi.fn(() => ({ echoed: 'hi' }));
    const echoSpy: ToolDef = { ...echoTool, handler: handlerSpy };
    const client = makeMockClient([
      mockMessage({
        toolUses: [{ id: 't1', name: 'echo', input: { msg: 'hi' } }],
      }),
      mockMessage({
        toolUses: [{ id: 't2', name: 'finalize', input: { result: 'go' } }],
      }),
    ]);
    const result = await runAgentLoop({
      systemPrompt: '',
      initialUserMessage: 'go',
      tools: [echoSpy, finalize],
      finalToolName: 'finalize',
      model: 'claude-sonnet-4-6',
      maxTurns: 5,
      costCapUsd: 1.5,
      timeoutMs: 60_000,
      sessionId: 'sess_test',
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: client,
    });
    expect(handlerSpy).toHaveBeenCalledWith({ msg: 'hi' });
    // Tool result must be present in reasoning log.
    const toolEntry = result.reasoningLog.find((e) => e.role === 'tool' && e.tool_name === 'echo');
    expect(toolEntry?.tool_result).toEqual({ echoed: 'hi' });
  });

  it('surfaces handler exceptions as is_error tool results without aborting', async () => {
    const throwTool: ToolDef = {
      name: 'echo',
      description: '',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        throw new Error('boom');
      },
    };
    const client = makeMockClient([
      mockMessage({ toolUses: [{ id: 't1', name: 'echo', input: {} }] }),
      mockMessage({ toolUses: [{ id: 't2', name: 'finalize', input: { result: 'go' } }] }),
    ]);
    const result = await runAgentLoop({
      systemPrompt: '',
      initialUserMessage: 'x',
      tools: [throwTool, finalize],
      finalToolName: 'finalize',
      model: 'claude-sonnet-4-6',
      maxTurns: 5,
      costCapUsd: 1.5,
      timeoutMs: 60_000,
      sessionId: 'sess_test',
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: client,
    });
    expect(result.status).toBe('completed');
    const errEntry = result.reasoningLog.find(
      (e) => e.role === 'tool' && e.is_error,
    );
    expect(errEntry).toBeTruthy();
    expect(String(errEntry?.tool_result)).toMatch(/boom/);
  });

  it('treats unknown tool calls as is_error without aborting', async () => {
    const client = makeMockClient([
      mockMessage({ toolUses: [{ id: 't1', name: 'mystery', input: {} }] }),
      mockMessage({ toolUses: [{ id: 't2', name: 'finalize', input: { result: 'go' } }] }),
    ]);
    const result = await runAgentLoop({
      systemPrompt: '',
      initialUserMessage: 'x',
      tools: [echoTool, finalize],
      finalToolName: 'finalize',
      model: 'claude-sonnet-4-6',
      maxTurns: 5,
      costCapUsd: 1.5,
      timeoutMs: 60_000,
      sessionId: 'sess_test',
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: client,
    });
    expect(result.status).toBe('completed');
    const errs = result.reasoningLog.filter((e) => e.role === 'tool' && e.is_error);
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe('agent-loop — termination conditions', () => {
  it('returns failed when model ends without calling finalize', async () => {
    const client = makeMockClient([
      mockMessage({ text: 'I am done thinking but I will not call finalize.' }),
    ]);
    const result = await runAgentLoop({
      systemPrompt: '',
      initialUserMessage: 'x',
      tools: [echoTool, finalize],
      finalToolName: 'finalize',
      model: 'claude-sonnet-4-6',
      maxTurns: 5,
      costCapUsd: 1.5,
      timeoutMs: 60_000,
      sessionId: 'sess_test',
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: client,
    });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toMatch(/without calling finalize/);
  });

  it('returns failed when maxTurns is reached', async () => {
    const responses: Anthropic.Message[] = [];
    for (let i = 0; i < 5; i++) {
      responses.push(
        mockMessage({ toolUses: [{ id: `t${i}`, name: 'echo', input: { msg: 'x' } }] }),
      );
    }
    const client = makeMockClient(responses);
    const result = await runAgentLoop({
      systemPrompt: '',
      initialUserMessage: 'x',
      tools: [echoTool, finalize],
      finalToolName: 'finalize',
      model: 'claude-sonnet-4-6',
      maxTurns: 3,
      costCapUsd: 1.5,
      timeoutMs: 60_000,
      sessionId: 'sess_test',
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: client,
    });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toMatch(/maxTurns/);
  });

  it('returns failed when cost cap is exceeded', async () => {
    // High output_tokens to push cost past $0.001 cap quickly.
    const big = mockMessage({
      toolUses: [{ id: 't1', name: 'echo', input: { msg: 'x' } }],
      inputTokens: 0,
      outputTokens: 1_000_000, // ~$15 of sonnet output tokens
    });
    const client = makeMockClient([big, big]);
    const result = await runAgentLoop({
      systemPrompt: '',
      initialUserMessage: 'x',
      tools: [echoTool, finalize],
      finalToolName: 'finalize',
      model: 'claude-sonnet-4-6',
      maxTurns: 5,
      costCapUsd: 0.001,
      timeoutMs: 60_000,
      sessionId: 'sess_test',
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: client,
    });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toMatch(/cost cap/);
  });

  it('throws when finalToolName is not in tools list', async () => {
    await expect(
      runAgentLoop({
        systemPrompt: '',
        initialUserMessage: 'x',
        tools: [echoTool],
        finalToolName: 'finalize',
        model: 'claude-sonnet-4-6',
        maxTurns: 5,
        costCapUsd: 1.5,
        timeoutMs: 60_000,
        sessionId: 'sess_test',
        agentName: 'architect-decomposition',
        surface: 'architect',
        anthropic: makeMockClient([]),
      }),
    ).rejects.toThrow(/finalToolName/);
  });
});
