// lib/chat/internal-chat-agent.ts
//
// Stream H, orchestrator. Claude (claude-sonnet-4-6) with native tool_use,
// registered with two tools:
//   1. pathfinder_leads  PRIMARY: structured access to the Internal org's
//      Supabase data via lib/chat/internal-lead-tool.
//   2. perplexity_research  SECONDARY: live external web research via the
//      existing lib/chat/sonar streamSonar wrapper. Only used when the
//      Pathfinder dataset cannot answer (recent news, leadership changes,
//      hiring signals).
//
// The agent loop streams text deltas back to the client through the
// supplied `emit` callback, plus tool_start / tool_done / researching /
// sources events so the panel can show progress.
//
// Plan: Pathfinder/docs/PLAN-stream-h-data-tool.md.

import Anthropic from '@anthropic-ai/sdk';
import type { ChatSourceCitation } from '@/lib/types';
import {
  completeSonar,
  isSonarConfigured,
  SonarRequestError,
} from '@/lib/chat/sonar';
import {
  leadToolJsonSchema,
  runLeadTool,
  summarizeToolResult,
  type LeadToolContext,
  type LeadToolInput,
  type LeadToolResult,
} from '@/lib/chat/internal-lead-tool';
import type { LeadChatSseEvent } from '@/lib/chat/lead-chat-types';

export const ORCHESTRATOR_MODEL = process.env.PF_INTERNAL_CHAT_MODEL ?? 'claude-sonnet-4-5';
const MAX_TOOL_ROUNDS = 4;
const MAX_TOKENS_PER_TURN = 2048;

// Tool registration as the Anthropic SDK expects them.
const PATHFINDER_LEADS_TOOL = {
  name: 'pathfinder_leads',
  description:
    'Query the Internal org\'s lead dataset stored in Pathfinder (pathfinder.projects + pathfinder.deals, scoped to org slug=internal). Use this BEFORE web search whenever the question is about leads in the dataset (counts, filters, scores, pipeline stages, signals). Ops: list (filter and order rows), get (one company by id), search (by name substring), aggregate (group_by counts).',
  input_schema: leadToolJsonSchema(),
} as const;

const PERPLEXITY_RESEARCH_TOOL = {
  name: 'perplexity_research',
  description:
    'Run a live Perplexity Sonar web search. Use ONLY for external facts that are not in the Pathfinder dataset, for example recent news, leadership changes, hiring signals, market context. Always cite returned sources.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The web search query. Be specific.' },
      recency_days: { type: 'number', description: 'Optional. Restrict results to the last N days.' },
    },
    required: ['query'],
  },
} as const;

// ── Stubbable client (matches the lib/llm/run.ts test hook pattern) ─────

type AnthropicLike = Pick<Anthropic, 'messages'>;
let _anthropicOverride: AnthropicLike | null = null;
let _cachedClient: Anthropic | null = null;

export function setAnthropicForTesting(stub: AnthropicLike | null): void {
  _anthropicOverride = stub;
  _cachedClient = null;
}

function anthropicClient(): Anthropic {
  if (_anthropicOverride) return _anthropicOverride as Anthropic;
  if (_cachedClient) return _cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  _cachedClient = new Anthropic({ apiKey });
  return _cachedClient;
}

// ── Public agent entrypoint ─────────────────────────────────────────────

export interface RunAgentArgs {
  orgId: string;
  orgSlug: string;
  orgName: string;
  scopeLabel: string;
  focal: { id: string; name: string } | null;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  emit: (e: LeadChatSseEvent) => void;
}

export interface RunAgentResult {
  text: string;
  sources: ChatSourceCitation[];
  toolCalls: Array<{ name: string; input: unknown; resultSummary: string }>;
  modelUsed: string;
  latencyMs: number;
  stopped: 'end_turn' | 'loop_guard' | 'error';
  errorMessage?: string;
}

function systemPrompt(args: Pick<RunAgentArgs, 'orgName' | 'scopeLabel' | 'focal'>): string {
  const lines: string[] = [
    `You are the Internal Lead Chat Agent for ${args.orgName} on Pathfinder. You help a salesperson reason about the Internal companies dataset and draft outreach.`,
    '',
    'Tools',
    '- pathfinder_leads: PRIMARY. The Internal dataset stored in Supabase (org slug=internal). Always try this first when the question is about leads in the dataset. Cheap to call.',
    '- perplexity_research: SECONDARY. Live web research via Perplexity Sonar. Use only for facts the dataset cannot answer (recent news, leadership changes, hiring signals). Always cite the returned sources.',
    '',
    'Rules',
    '- Ground every claim in real values from the tool results. Never fabricate a number, a company name, or a field.',
    '- When asked why a company scored what it did, call pathfinder_leads op=get for that company and narrate the six qualitative weighted signals it returns. The ranker does not persist per-signal point contributions; describe the evidence, not invented points.',
    '- When asked an aggregation question (how many, which, top N, group by), call pathfinder_leads with op=aggregate or op=list and ground the answer in the returned numbers.',
    '- When asked about something external (recent news, leadership, hiring), call perplexity_research. Include the source links in your final answer.',
    '- No em-dashes or en-dashes. Use commas, periods, or the word "to".',
    '- Plain spoken, restrained, specific. Name companies and fields you used.',
    '- If a tool returns op=error or empty results, say so plainly and offer the next step (refine the filter, search by name, try another op).',
    '',
    `Scope label: ${args.scopeLabel}`,
  ];
  if (args.focal) {
    lines.push('');
    lines.push(`Focal company (the user opened this lead): id="${args.focal.id}" name="${args.focal.name}". When the question is implicit ("why did this score what it did", "draft an opener"), assume the focal company.`);
  }
  return lines.join('\n');
}

interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function isToolUseBlock(b: Anthropic.Messages.ContentBlock): b is Anthropic.Messages.ToolUseBlock {
  return b.type === 'tool_use';
}

function isTextBlock(b: Anthropic.Messages.ContentBlock): b is Anthropic.Messages.TextBlock {
  return b.type === 'text';
}

export async function runInternalChatAgent(args: RunAgentArgs): Promise<RunAgentResult> {
  const startedAt = Date.now();
  const client = anthropicClient();

  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const h of args.history.slice(-12)) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: 'user', content: args.message });

  const ctx: LeadToolContext = { orgId: args.orgId, orgSlug: args.orgSlug };
  const tools = [PATHFINDER_LEADS_TOOL, PERPLEXITY_RESEARCH_TOOL] as unknown as Anthropic.Messages.Tool[];

  const sources: ChatSourceCitation[] = [];
  const toolCalls: RunAgentResult['toolCalls'] = [];
  let finalText = '';
  let stopReason: RunAgentResult['stopped'] = 'end_turn';
  let lastErrorMessage: string | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let assistantContent: Anthropic.Messages.ContentBlock[] = [];
    let stop: string | null = null;

    try {
      const stream = client.messages.stream({
        model: ORCHESTRATOR_MODEL,
        max_tokens: MAX_TOKENS_PER_TURN,
        system: systemPrompt(args),
        tools,
        messages,
      });

      let emittingToolName: string | null = null;
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            emittingToolName = block.name;
            args.emit({
              type: 'tool_start',
              name:
                block.name === 'perplexity_research'
                  ? 'perplexity_sonar'
                  : 'pathfinder_leads',
            });
            if (block.name === 'perplexity_research') {
              args.emit({ type: 'researching', provider: 'perplexity-sonar' });
            }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta' && event.delta.text) {
            args.emit({ type: 'delta', text: event.delta.text });
            finalText += event.delta.text;
          }
        } else if (event.type === 'content_block_stop') {
          emittingToolName = null;
        }
      }

      const finalMessage = await stream.finalMessage();
      assistantContent = finalMessage.content;
      stop = (finalMessage.stop_reason as string | null) ?? null;
    } catch (err) {
      stopReason = 'error';
      lastErrorMessage = err instanceof Error ? err.message : String(err);
      break;
    }

    if (stop !== 'tool_use') {
      // end_turn or anything else terminal: we are done.
      stopReason = 'end_turn';
      break;
    }

    // Append the assistant's tool_use turn to the message list verbatim.
    messages.push({ role: 'assistant', content: assistantContent });

    // Run each tool_use block and build the tool_result content.
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of assistantContent) {
      if (!isToolUseBlock(block)) continue;
      const use: ToolUseBlock = {
        id: block.id,
        name: block.name,
        input: (block.input as Record<string, unknown>) ?? {},
      };
      if (use.name === 'pathfinder_leads') {
        const leadInput = use.input as unknown as LeadToolInput;
        let result: LeadToolResult;
        try {
          result = await runLeadTool(leadInput, ctx);
        } catch (err) {
          result = {
            op: 'error',
            message: err instanceof Error ? err.message : String(err),
          };
        }
        const summary = summarizeToolResult(result);
        toolCalls.push({ name: use.name, input: use.input, resultSummary: summary });
        args.emit({ type: 'tool_done', name: 'pathfinder_leads', ok: result.op !== 'error' });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
        });
      } else if (use.name === 'perplexity_research') {
        const q = (use.input.query as string | undefined) ?? '';
        const recencyDays = (use.input.recency_days as number | undefined) ?? undefined;
        if (!isSonarConfigured()) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify({ ok: false, reason: 'sonar_not_configured' }),
            is_error: true,
          });
          args.emit({ type: 'tool_done', name: 'perplexity_sonar', ok: false });
          toolCalls.push({ name: use.name, input: use.input, resultSummary: 'sonar not configured' });
          continue;
        }
        try {
          const sonarRes = await completeSonar({
            query: q,
            recencyDays,
            systemPrompt:
              'You are a research helper. Answer concisely using current web sources. Include the most relevant facts and dates.',
          });
          for (const c of sonarRes.citations) {
            if (!sources.some((s) => s.url === c.url)) sources.push(c);
          }
          if (sonarRes.citations.length > 0) {
            args.emit({ type: 'sources', items: sonarRes.citations });
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify({
              ok: true,
              text: sonarRes.text,
              citations: sonarRes.citations,
            }),
          });
          args.emit({ type: 'tool_done', name: 'perplexity_sonar', ok: true });
          toolCalls.push({
            name: use.name,
            input: use.input,
            resultSummary: `Sonar ${sonarRes.citations.length} sources`,
          });
        } catch (err) {
          const message =
            err instanceof SonarRequestError
              ? `Sonar status ${err.status}: ${err.body.slice(0, 200)}`
              : err instanceof Error
                ? err.message
                : String(err);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify({ ok: false, reason: 'sonar_error', message }),
            is_error: true,
          });
          args.emit({ type: 'tool_done', name: 'perplexity_sonar', ok: false });
          toolCalls.push({
            name: use.name,
            input: use.input,
            resultSummary: `Sonar error: ${message}`,
          });
        }
      } else {
        // Unknown tool: surface the failure so the model can recover.
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify({ ok: false, reason: 'unknown_tool', name: use.name }),
          is_error: true,
        });
      }
    }

    if (toolResults.length === 0) {
      // The model stopped on tool_use but emitted no tool_use blocks we
      // could run. Treat as terminal to avoid an infinite stall.
      stopReason = 'end_turn';
      break;
    }
    messages.push({ role: 'user', content: toolResults });

    if (round === MAX_TOOL_ROUNDS - 1) {
      stopReason = 'loop_guard';
    }
  }

  return {
    text: finalText.trim(),
    sources,
    toolCalls,
    modelUsed: ORCHESTRATOR_MODEL,
    latencyMs: Date.now() - startedAt,
    stopped: stopReason,
    errorMessage: lastErrorMessage,
  };
}
