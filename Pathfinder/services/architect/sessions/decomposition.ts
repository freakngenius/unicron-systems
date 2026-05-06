// services/architect/sessions/decomposition.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3.
//
// Orchestrator for a decomposition session. Wraps the agent loop with:
//   - architect_sessions row create/update bookkeeping
//   - cost cap + timeout enforcement (delegated to runtime)
//   - server-side validation of the model's finalize payload
//   - architect_proposals row creation on success
//   - reasoning_log persistence for the operator UI's "thinking" stream

import {
  runAgentLoop,
  type AgentLoopResult,
  type AnthropicClient,
  type ToolDef,
} from '@/services/architect/runtime/agent-loop';
import { getSessionStore } from '@/services/architect/runtime/session-store';
import {
  DECOMPOSITION_PROMPT_VERSION,
  DECOMPOSITION_SYSTEM_PROMPT,
} from '@/services/architect/prompts/decomposition';
import {
  DECOMPOSITION_TOOLS,
  FINAL_TOOL_NAME,
  validateArchitectureTool,
} from '@/services/architect/tools/decomposition';
import {
  SESSION_COST_CAP_USD,
  SESSION_TIMEOUT_MS,
  type DecompositionInput,
  type DecompositionProposal,
  type DecompositionResponse,
} from '@/services/architect/types';
import { SOURCE_CATALOG } from '@/services/architect/tools/source-catalog';

const DECOMPOSITION_MODEL = process.env.PF_ARCHITECT_DECOMPOSITION_MODEL ?? 'claude-sonnet-4-6';
const DECOMPOSITION_MAX_TURNS = 12;

export interface RunDecompositionOptions {
  input: DecompositionInput;
  // Test injection.
  anthropic?: AnthropicClient;
  toolsOverride?: ToolDef[];
}

export async function runDecomposition(
  opts: RunDecompositionOptions,
): Promise<DecompositionResponse> {
  const { input } = opts;
  if (!input.buyer_pain_prompt || input.buyer_pain_prompt.trim().length < 10) {
    throw new Error('buyer_pain_prompt must be at least 10 characters');
  }
  const verticalId = input.vertical_id ?? input.existing_vertical_id ?? 'pathfinder-default';
  const trigger = input.trigger ?? 'manual';
  const store = getSessionStore();

  const session = await store.createSession({
    vertical_id: verticalId,
    session_type: 'decomposition',
    trigger,
    input_payload: {
      buyer_pain_prompt: input.buyer_pain_prompt,
      constraints: input.constraints ?? [],
      vertical_id: verticalId,
      customer_org_id: input.customer_org_id ?? null,
      existing_vertical_id: input.existing_vertical_id ?? null,
      prompt_version: DECOMPOSITION_PROMPT_VERSION,
    },
    customer_org_id: input.customer_org_id ?? null,
  });
  const startedAt = Date.now();

  const initialUserMessage = buildInitialUserMessage(input);
  let loopResult: AgentLoopResult | null = null;
  let runError: Error | null = null;
  try {
    loopResult = await runAgentLoop({
      systemPrompt: DECOMPOSITION_SYSTEM_PROMPT,
      initialUserMessage,
      tools: opts.toolsOverride ?? DECOMPOSITION_TOOLS,
      finalToolName: FINAL_TOOL_NAME,
      model: DECOMPOSITION_MODEL,
      maxTurns: DECOMPOSITION_MAX_TURNS,
      costCapUsd: SESSION_COST_CAP_USD.decomposition,
      timeoutMs: SESSION_TIMEOUT_MS.decomposition,
      sessionId: session.id,
      agentName: 'architect-decomposition',
      surface: 'architect',
      anthropic: opts.anthropic,
    });
  } catch (err) {
    runError = err instanceof Error ? err : new Error(String(err));
  }

  const durationMs = Date.now() - startedAt;
  if (!loopResult) {
    await store.updateSession(session.id, {
      reasoning_log: [],
      output_payload: null,
      status: 'failed',
      failure_reason: runError?.message ?? 'unknown loop failure',
      duration_ms: durationMs,
      cost_usd: 0,
      turns: 0,
    });
    throw runError ?? new Error('agent loop returned no result');
  }

  // Validate the model's finalize payload server-side. Drift between the
  // tool schema and downstream consumers is the most common failure mode,
  // so we re-run the structural validator before persisting.
  let proposal: DecompositionProposal | null = null;
  let validationFailureReason: string | null = null;
  if (loopResult.status === 'completed' && loopResult.finalToolInput) {
    const candidate = loopResult.finalToolInput as Partial<DecompositionProposal>;
    const validation = (await validateArchitectureTool.handler({
      data_sources_proposed: candidate.data_sources_proposed ?? [],
      layer_2_watchers: candidate.layer_2_watchers ?? [],
      layer_3_agents: candidate.layer_3_agents ?? [],
      layer_4_agents: candidate.layer_4_agents ?? [],
      estimates: candidate.estimates ?? {},
    })) as { ok: boolean; issues: string[] };
    if (!validation.ok) {
      // The model claimed to have validated but the structural checks fail.
      // We still persist the proposal but mark it low-confidence + surface
      // issues. Per spec §3 ("If validation fails, retry once with error
      // context. If still fails, return decomposition with
      // architecture_confidence: low and surface to operator").
      const downgraded: DecompositionProposal = {
        ...(candidate as DecompositionProposal),
        estimates: {
          ...(candidate.estimates ?? { daily_qualified_volume: 0, cost_per_lead_usd: 0 }),
          architecture_confidence: 'low',
        } as DecompositionProposal['estimates'],
        open_questions: [
          ...(candidate.open_questions ?? []),
          ...validation.issues.map((i) => `validation: ${i}`),
        ],
      };
      proposal = downgraded;
      validationFailureReason = validation.issues.join('; ');
    } else {
      proposal = candidate as DecompositionProposal;
    }
    // Strip cross-vertical noise from the rejected list regardless of
    // validation outcome.
    if (proposal) {
      proposal = {
        ...proposal,
        data_sources_rejected: filterRejectedSources(
          proposal.data_sources_rejected ?? [],
          proposal.data_sources_proposed ?? [],
        ),
      };
    }
  }

  const status =
    loopResult.status === 'completed' && proposal
      ? 'completed'
      : loopResult.status === 'completed'
      ? 'failed'
      : loopResult.status;

  await store.updateSession(session.id, {
    reasoning_log: loopResult.reasoningLog,
    output_payload: proposal as unknown as Record<string, unknown> | null,
    status,
    failure_reason:
      loopResult.failureReason ??
      validationFailureReason ??
      (status === 'failed' ? 'unknown failure' : null),
    duration_ms: durationMs,
    cost_usd: loopResult.costUsd,
    turns: loopResult.turns,
  });

  if (!proposal) {
    throw new Error(
      `decomposition session ${session.id} ended with status=${status}: ${
        loopResult.failureReason ?? 'no proposal produced'
      }`,
    );
  }

  // Map architecture_confidence string → numeric confidence for the
  // architect_proposals row.
  const confidenceNum =
    proposal.estimates.architecture_confidence === 'high'
      ? 0.85
      : proposal.estimates.architecture_confidence === 'medium'
      ? 0.6
      : 0.35;
  const proposalRow = await store.createProposal({
    session_id: session.id,
    vertical_id: verticalId,
    type: 'vertical_configuration',
    headline: `Vertical config: ${proposal.buyer} — ${proposal.buying_signal}`,
    body: shortBody(proposal),
    details: proposal as unknown as Record<string, unknown>,
    confidence: confidenceNum,
    source_input_summary: input.buyer_pain_prompt.slice(0, 240),
  });

  return {
    proposal_id: proposalRow.id,
    session_id: session.id,
    architecture: proposal,
    reasoning: summarizeReasoning(loopResult),
    cost_usd: loopResult.costUsd,
    duration_ms: durationMs,
    status,
  };
}

function buildInitialUserMessage(input: DecompositionInput): string {
  const lines = [
    'BUYER PAIN PROMPT:',
    input.buyer_pain_prompt.trim(),
  ];
  if (input.constraints && input.constraints.length > 0) {
    lines.push('', 'CONSTRAINTS:');
    for (const c of input.constraints) lines.push(`- ${c}`);
  }
  if (input.existing_vertical_id) {
    lines.push('', `EXTENDING EXISTING VERTICAL: ${input.existing_vertical_id}`);
  }
  lines.push(
    '',
    'Decompose this into a vertical_configuration proposal following the workflow in your system prompt. Use the tools available. Call finalizeProposal when complete.',
  );
  return lines.join('\n');
}

/**
 * Strip cross-vertical noise from data_sources_rejected.
 * Derives the customer's relevant industries from the proposed sources (which
 * the Architect chose because they match the vertical). Only keeps rejected
 * entries whose SOURCE_CATALOG industries overlap with the proposed set.
 * Unknown source types (not in catalog) are dropped — they're either
 * hallucinated or out-of-catalog, and shouldn't surface to operators.
 */
export function filterRejectedSources(
  rejected: DecompositionProposal['data_sources_rejected'],
  proposed: DecompositionProposal['data_sources_proposed'],
): DecompositionProposal['data_sources_rejected'] {
  const proposedTypes = new Set(proposed.map((s) => s.type));
  const proposedEntries = SOURCE_CATALOG.filter((s) => proposedTypes.has(s.type));
  const relevantIndustries = new Set(proposedEntries.flatMap((s) => s.industries));
  if (relevantIndustries.size === 0) return rejected;
  return rejected.filter((r) => {
    const entry = SOURCE_CATALOG.find((s) => s.type === r.type);
    if (!entry) return false;
    return entry.industries.some((i) => relevantIndustries.has(i));
  });
}

function shortBody(p: DecompositionProposal): string {
  const sourceCount = p.data_sources_proposed.length;
  const agentCount = p.layer_3_agents.length + p.layer_4_agents.length;
  const dailyVol = p.estimates.daily_qualified_volume;
  const cpl = p.estimates.cost_per_lead_usd;
  return `${sourceCount} data sources, ${agentCount} synthesis agents. Estimated ${dailyVol} qualified leads/day at ~$${cpl.toFixed(3)}/lead. Confidence: ${p.estimates.architecture_confidence}.`;
}

function summarizeReasoning(result: AgentLoopResult): string[] {
  const summaries: string[] = [];
  for (const entry of result.reasoningLog) {
    if (entry.role !== 'assistant') continue;
    if (entry.text) {
      const firstLine = entry.text.split('\n').find((l) => l.trim().length > 0) ?? '';
      summaries.push(firstLine.slice(0, 280));
    } else if (entry.tool_calls && entry.tool_calls.length > 0) {
      const names = entry.tool_calls.map((c) => c.name).join(', ');
      summaries.push(`called: ${names}`);
    }
  }
  return summaries;
}
