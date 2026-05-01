// services/architect/sessions/discovery.ts — Phase 2 Stream D Gate D3.
// Spec: SPEC - Architect Agent.md §5.

import {
  runAgentLoop,
  type AgentLoopResult,
  type AnthropicClient,
  type ToolDef,
} from '@/services/architect/runtime/agent-loop';
import { getSessionStore } from '@/services/architect/runtime/session-store';
import {
  DISCOVERY_PROMPT_VERSION,
  DISCOVERY_SYSTEM_PROMPT,
} from '@/services/architect/prompts/discovery';
import {
  DISCOVERY_FINAL_TOOL_NAME,
  DISCOVERY_PROPOSAL_TOOL_NAME,
  DISCOVERY_TOOLS,
} from '@/services/architect/tools/discovery';
import {
  SESSION_COST_CAP_USD,
  SESSION_TIMEOUT_MS,
  type ArchitectProposalRow,
  type ArchitectSessionStatus,
  type DiscoveryInput,
} from '@/services/architect/types';

const DISCOVERY_MODEL = process.env.PF_ARCHITECT_DISCOVERY_MODEL ?? 'claude-sonnet-4-6';
const DISCOVERY_MAX_TURNS = 25;

interface StagedSourceProposal {
  headline: string;
  body?: string;
  candidate_jurisdiction: string;
  source_type: string;
  source_url: string;
  source_name: string;
  tier: 'tier_1' | 'tier_2' | 'tier_3';
  reference_count?: number;
  reference_rate: number;
  lift_per_day: number;
  confidence: number;
  reasoning: string;
}

export interface RunDiscoveryOptions {
  input: DiscoveryInput;
  anthropic?: AnthropicClient;
  toolsOverride?: ToolDef[];
}

export interface DiscoveryResponse {
  session_id: string;
  proposals: ArchitectProposalRow[];
  rejected: { candidate: string; reason: string }[];
  summary: string;
  cost_usd: number;
  duration_ms: number;
  status: ArchitectSessionStatus;
}

export async function runDiscovery(opts: RunDiscoveryOptions): Promise<DiscoveryResponse> {
  const verticalId = opts.input.vertical_id || 'pathfinder-default';
  const trigger = opts.input.trigger;
  const store = getSessionStore();

  const session = await store.createSession({
    vertical_id: verticalId,
    session_type: 'discovery',
    trigger,
    input_payload: {
      vertical_id: verticalId,
      trigger,
      context: opts.input.context ?? {},
      prompt_version: DISCOVERY_PROMPT_VERSION,
    },
  });
  const startedAt = Date.now();

  const staged: StagedSourceProposal[] = [];
  const seen = new Set<string>(); // dedupe by source_type+jurisdiction
  const baseTools = opts.toolsOverride ?? DISCOVERY_TOOLS;
  const tools: ToolDef[] = baseTools.map((t) =>
    t.name === DISCOVERY_PROPOSAL_TOOL_NAME
      ? {
          ...t,
          handler: async (input) => {
            const validation = validateStaged(input as Record<string, unknown>);
            if (!validation.ok) return { ok: false, error: validation.error };
            const key = `${validation.proposal.source_type}|${validation.proposal.candidate_jurisdiction}`;
            if (seen.has(key)) {
              return { ok: false, error: `duplicate proposal ${key} in this session` };
            }
            seen.add(key);
            staged.push(validation.proposal);
            return { ok: true, proposal_index: staged.length };
          },
        }
      : t,
  );

  const contextSummary = opts.input.context
    ? `Trigger context: ${JSON.stringify(opts.input.context).slice(0, 600)}.`
    : 'No specific trigger context — periodic scan.';

  const initialUserMessage =
    `Run a discovery session for vertical "${verticalId}". Trigger: ${trigger}. ${contextSummary} ` +
    'Use the workflow in your system prompt: queryRecentSignals → analyzeSourceMentions → searchOpenDataPortals → estimateImpact → createSourceProposal → finalizeDiscoveryRun. ' +
    'Conservatism gates: reference_rate ≥ 15%, lift_per_day ≥ 2, real portal URL required, max 5 proposals.';

  let loopResult: AgentLoopResult | null = null;
  let runError: Error | null = null;
  try {
    loopResult = await runAgentLoop({
      systemPrompt: DISCOVERY_SYSTEM_PROMPT,
      initialUserMessage,
      tools,
      finalToolName: DISCOVERY_FINAL_TOOL_NAME,
      model: DISCOVERY_MODEL,
      maxTurns: DISCOVERY_MAX_TURNS,
      costCapUsd: SESSION_COST_CAP_USD.discovery,
      timeoutMs: SESSION_TIMEOUT_MS.discovery,
      sessionId: session.id,
      agentName: 'architect-discovery',
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

  const finalSummary = loopResult.finalToolInput as
    | {
        proposed_count?: number;
        rejected_candidates?: { candidate: string; reason: string }[];
        summary?: string;
      }
    | null;

  const accepted = staged.slice(0, 5).filter(passesGates);
  const rejectedFromGates = staged.slice(0, 5).filter((p) => !passesGates(p)).map((p) => ({
    candidate: `${p.source_type}|${p.candidate_jurisdiction}`,
    reason: `gate-fail: reference_rate=${p.reference_rate}, lift_per_day=${p.lift_per_day}`,
  }));
  if (staged.length > 5) {
    rejectedFromGates.push({
      candidate: 'overflow',
      reason: `${staged.length - 5} candidates beyond 5-per-session cap`,
    });
  }
  const rejected = [
    ...(finalSummary?.rejected_candidates ?? []),
    ...rejectedFromGates,
  ];

  const persistedProposals: ArchitectProposalRow[] = [];
  for (const p of accepted) {
    const row = await store.createProposal({
      session_id: session.id,
      vertical_id: verticalId,
      type: 'source_discovery',
      headline: p.headline,
      body: p.body ?? buildBody(p),
      details: p as unknown as Record<string, unknown>,
      confidence: clamp01(p.confidence),
    });
    persistedProposals.push(row);
  }

  const status: ArchitectSessionStatus =
    loopResult.status === 'completed' ? 'completed' : loopResult.status;

  await store.updateSession(session.id, {
    reasoning_log: loopResult.reasoningLog,
    output_payload: {
      proposed_count: persistedProposals.length,
      rejected,
      summary: finalSummary?.summary ?? '',
    } as unknown as Record<string, unknown>,
    status,
    failure_reason: loopResult.failureReason ?? null,
    duration_ms: durationMs,
    cost_usd: loopResult.costUsd,
    turns: loopResult.turns,
  });

  return {
    session_id: session.id,
    proposals: persistedProposals,
    rejected,
    summary: finalSummary?.summary ?? '',
    cost_usd: loopResult.costUsd,
    duration_ms: durationMs,
    status,
  };
}

function passesGates(p: StagedSourceProposal): boolean {
  return p.reference_rate >= 0.15 && p.lift_per_day >= 2 && /^https?:\/\//i.test(p.source_url);
}

function validateStaged(
  input: Record<string, unknown>,
): { ok: true; proposal: StagedSourceProposal } | { ok: false; error: string } {
  const headline = String(input.headline ?? '');
  const candidate_jurisdiction = String(input.candidate_jurisdiction ?? '');
  const source_type = String(input.source_type ?? '');
  const source_url = String(input.source_url ?? '');
  const source_name = String(input.source_name ?? '');
  const tier = String(input.tier ?? 'tier_3');
  const reference_rate = Number(input.reference_rate ?? 0);
  const lift_per_day = Number(input.lift_per_day ?? 0);
  const confidence = Number(input.confidence ?? 0);
  const reasoning = String(input.reasoning ?? '');

  if (!headline) return { ok: false, error: 'headline required' };
  if (!candidate_jurisdiction) return { ok: false, error: 'candidate_jurisdiction required' };
  if (!source_type) return { ok: false, error: 'source_type required' };
  if (!/^https?:\/\//i.test(source_url)) return { ok: false, error: 'source_url must be a real http(s) URL' };
  if (!source_name) return { ok: false, error: 'source_name required' };
  if (!['tier_1', 'tier_2', 'tier_3'].includes(tier)) return { ok: false, error: 'tier must be tier_1/tier_2/tier_3' };
  if (reference_rate < 0.15) return { ok: false, error: `reference_rate ${reference_rate} below 0.15 spec gate` };
  if (lift_per_day < 2) return { ok: false, error: `lift_per_day ${lift_per_day} below 2 spec gate` };
  if (reasoning.length < 30) return { ok: false, error: 'reasoning too short' };

  return {
    ok: true,
    proposal: {
      headline,
      body: input.body ? String(input.body) : undefined,
      candidate_jurisdiction,
      source_type,
      source_url,
      source_name,
      tier: tier as 'tier_1' | 'tier_2' | 'tier_3',
      reference_count: input.reference_count != null ? Number(input.reference_count) : undefined,
      reference_rate,
      lift_per_day,
      confidence: clamp01(confidence),
      reasoning,
    },
  };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function buildBody(p: StagedSourceProposal): string {
  return `Add ${p.source_name} (${p.tier}) covering ${p.candidate_jurisdiction}. Referenced in ${(p.reference_rate * 100).toFixed(0)}% of recent qualified signals; estimated lift ~${p.lift_per_day.toFixed(1)} qualified leads/day. URL: ${p.source_url}.`;
}
