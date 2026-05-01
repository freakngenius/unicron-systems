// services/architect/runtime/agent-loop.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §2 (agent framing), §6 (tools impl notes),
//       SPEC - Backend Architecture.md §5 (LLM gateway integration).
//
// Why a hand-rolled loop and not @anthropic-ai/claude-agent-sdk:
//   The Claude Agent SDK spawns Claude Code as a subprocess. Vercel
//   serverless functions cannot ship the Claude binary — the Architect
//   needs to run inside an API route. The semantics the spec asks for
//   ("tool-use loops, system prompts, persisted session state") are
//   exactly what Anthropic's Messages API tool-use surface provides.
//   This loop is a thin orchestrator over messages.create({ tools }).
//   See MEMORY/decisions.md (2026-05-01 — Architect runtime: Messages API
//   tool-use loop, not @anthropic-ai/claude-agent-sdk subprocess).
//
// Surface:
//   runAgentLoop({ systemPrompt, initialUserMessage, tools, model, maxTurns,
//                  costCapUsd, timeoutMs, onTurn, sessionId, surface,
//                  agentName, anthropic? })
//   → { reasoningLog, finalToolName, finalToolInput, costUsd, turns,
//       status: 'completed' | 'failed' | 'timed_out' }
//
// The "final" signal is a designated tool name (e.g., 'finalizeProposal'):
// when the model calls it, the loop captures the tool input as the output
// and exits. This gives a clean, validated, structured exit instead of
// parsing free-form JSON from the assistant's text channel.

import Anthropic from '@anthropic-ai/sdk';
import { costUsd as computeCost } from '@/lib/llm/pricing';
import { recordLLMCall } from '@/lib/llm/recorder';
import type { ReasoningEntry } from '@/services/architect/types';

// Tool definition shape — matches Anthropic Messages API tool block.
export interface ToolDef<TInput = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  // Server-side handler invoked when the model calls the tool.
  // `is_error: true` is set when the handler throws — the loop continues
  // and surfaces the error to the model so it can recover.
  handler: (input: TInput) => Promise<TResult> | TResult;
}

export interface AgentLoopOptions {
  systemPrompt: string;
  initialUserMessage: string;
  tools: ToolDef[];
  // Tool name whose invocation terminates the loop. When the model calls
  // this tool the input is captured as the session's structured output and
  // the loop exits with status='completed'.
  finalToolName: string;
  model: string;
  maxTurns: number;
  costCapUsd: number;
  timeoutMs: number;
  // For lib/llm/recorder.ts — every Anthropic round-trip writes one row.
  sessionId: string;
  agentName: string;
  surface: 'architect';
  // Optional dependency injection for tests + future Helicone routing.
  anthropic?: AnthropicClient;
  // Notified after each assistant turn for live reasoning-log streaming.
  onTurn?: (entry: ReasoningEntry) => void;
}

export interface AgentLoopResult {
  reasoningLog: ReasoningEntry[];
  finalToolName: string | null;
  finalToolInput: Record<string, unknown> | null;
  costUsd: number;
  turns: number;
  status: 'completed' | 'failed' | 'timed_out';
  failureReason?: string;
}

// Minimal subset of Anthropic SDK used so tests can mock without dragging
// the full client surface.
export interface AnthropicClient {
  messages: {
    create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
}

let _defaultClient: Anthropic | null = null;
function defaultAnthropicClient(): Anthropic {
  if (_defaultClient) return _defaultClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const heliconeKey = process.env.HELICONE_API_KEY;
  if (heliconeKey) {
    _defaultClient = new Anthropic({
      apiKey,
      baseURL: 'https://anthropic.helicone.ai',
      defaultHeaders: { 'Helicone-Auth': `Bearer ${heliconeKey}` },
    });
  } else {
    _defaultClient = new Anthropic({ apiKey });
  }
  return _defaultClient;
}

// Anthropic API tool definition (excludes our `handler`).
function toApiTool(tool: ToolDef): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool['input_schema'],
  };
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const anthropic = opts.anthropic ?? defaultAnthropicClient();
  const startedAt = Date.now();
  const toolsByName: Record<string, ToolDef> = {};
  for (const t of opts.tools) toolsByName[t.name] = t;
  if (!toolsByName[opts.finalToolName]) {
    throw new Error(`finalToolName '${opts.finalToolName}' not in tools list`);
  }
  const apiTools = opts.tools.map(toApiTool);

  const reasoningLog: ReasoningEntry[] = [
    { ts: new Date().toISOString(), role: 'user', text: opts.initialUserMessage },
  ];
  let totalCost = 0;
  let turns = 0;
  let finalToolInput: Record<string, unknown> | null = null;
  let finalToolNameSeen: string | null = null;

  // Anthropic Messages API conversation history.
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: opts.initialUserMessage },
  ];

  while (turns < opts.maxTurns) {
    if (Date.now() - startedAt > opts.timeoutMs) {
      return finalize('timed_out', `exceeded timeout ${opts.timeoutMs}ms`);
    }
    if (totalCost >= opts.costCapUsd) {
      return finalize('failed', `cost cap $${opts.costCapUsd.toFixed(2)} reached`);
    }

    turns += 1;
    const turnStartedAt = Date.now();
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: opts.model,
        max_tokens: 4096,
        system: opts.systemPrompt,
        tools: apiTools,
        messages,
      });
    } catch (err) {
      return finalize(
        'failed',
        `anthropic api error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Cost telemetry for this turn.
    const usage = response.usage;
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cachedInputTokens =
      (usage as unknown as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
    const turnCost = computeCost({
      model: opts.model,
      inputTokens,
      outputTokens,
      cachedInputTokens,
    });
    totalCost += turnCost;
    recordLLMCall({
      model: opts.model,
      surface: opts.surface,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      costUsd: turnCost,
      latencyMs: Date.now() - turnStartedAt,
      cacheHit: cachedInputTokens > 0,
      agentName: opts.agentName,
      sessionId: opts.sessionId,
    });

    // Capture assistant text + tool calls.
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const assistantText = textBlocks.map((b) => b.text).join('\n').trim();
    const assistantEntry: ReasoningEntry = {
      ts: new Date().toISOString(),
      role: 'assistant',
      text: assistantText || undefined,
      tool_calls: toolUseBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })),
    };
    reasoningLog.push(assistantEntry);
    opts.onTurn?.(assistantEntry);

    // Push the assistant message into history verbatim.
    messages.push({ role: 'assistant', content: response.content });

    // If no tool calls, the model is done thinking but didn't finalize.
    // Treat as a failure unless the stop_reason was end_turn AND text
    // contained a parseable proposal — but we mandate tool-based finalize.
    if (toolUseBlocks.length === 0) {
      return finalize('failed', 'model ended turn without calling finalize tool');
    }

    // Process each tool call in order. If any tool is the finalize tool,
    // capture its input and exit.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const tool = toolsByName[block.name];
      if (!tool) {
        const errEntry: ReasoningEntry = {
          ts: new Date().toISOString(),
          role: 'tool',
          tool_use_id: block.id,
          tool_name: block.name,
          tool_result: `unknown tool: ${block.name}`,
          is_error: true,
        };
        reasoningLog.push(errEntry);
        opts.onTurn?.(errEntry);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `error: unknown tool ${block.name}`,
          is_error: true,
        });
        continue;
      }
      if (block.name === opts.finalToolName) {
        finalToolInput = block.input as Record<string, unknown>;
        finalToolNameSeen = block.name;
        const finalEntry: ReasoningEntry = {
          ts: new Date().toISOString(),
          role: 'tool',
          tool_use_id: block.id,
          tool_name: block.name,
          tool_result: 'finalized',
        };
        reasoningLog.push(finalEntry);
        opts.onTurn?.(finalEntry);
        return finalize('completed');
      }
      let result: unknown;
      let isError = false;
      try {
        result = await tool.handler(block.input as Record<string, unknown>);
      } catch (err) {
        result = `error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }
      const entry: ReasoningEntry = {
        ts: new Date().toISOString(),
        role: 'tool',
        tool_use_id: block.id,
        tool_name: block.name,
        tool_result: result,
        is_error: isError,
      };
      reasoningLog.push(entry);
      opts.onTurn?.(entry);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
        is_error: isError ? true : undefined,
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return finalize('failed', `exceeded maxTurns ${opts.maxTurns}`);

  function finalize(
    status: AgentLoopResult['status'],
    failureReason?: string,
  ): AgentLoopResult {
    return {
      reasoningLog,
      finalToolName: finalToolNameSeen,
      finalToolInput,
      costUsd: Number(totalCost.toFixed(4)),
      turns,
      status,
      failureReason,
    };
  }
}
