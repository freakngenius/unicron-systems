// services/architect/sessions/tuning.ts — Phase 2 Stream D Gate D2.
// Spec: SPEC - Architect Agent.md §4.
//
// Orchestrator for a tuning session. Wraps the agent loop with:
//   - architect_sessions row create/update bookkeeping
//   - cost cap + timeout
//   - per-call capture of createTuningProposal so multiple proposals can
//     be persisted in a single session
//   - server-side re-validation of conservatism gates (count >= 3,
//     win_rate > 0.5, side_effect_rate < 0.1)
//
// Multiple architect_proposals rows may emerge from one architect_sessions row.

import {
  runAgentLoop,
  type AgentLoopResult,
  type AnthropicClient,
  type ToolDef,
} from '@/services/architect/runtime/agent-loop';
import { getSessionStore } from '@/services/architect/runtime/session-store';
import {
  TUNING_PROMPT_VERSION,
  TUNING_SYSTEM_PROMPT,
} from '@/services/architect/prompts/tuning';
import {
  TUNING_FINAL_TOOL_NAME,
  TUNING_PROPOSAL_TOOL_NAME,
  TUNING_TOOLS,
} from '@/services/architect/tools/tuning';
import {
  SESSION_COST_CAP_USD,
  SESSION_TIMEOUT_MS,
  type ArchitectProposalRow,
  type ArchitectSessionStatus,
  type TuningInput,
  type TuningProposal,
} from '@/services/architect/types';

const TUNING_MODEL = process.env.PF_ARCHITECT_TUNING_MODEL ?? 'claude-sonnet-4-6';
const TUNING_MAX_TURNS = 30;

interface StagedProposal {
  headline: string;
  body?: string;
  role: string;
  cluster_key: string;
  cluster_count: number;
  example_reasons?: string[];
  current_instruction: string;
  proposed_instruction: string;
  shadow_test: {
    sample_size: number;
    wins: number;
    losses: number;
    side_effects: number;
    win_rate: number;
    side_effect_rate: number;
    method?: string;
  };
  confidence: number;
  estimated_impact: string;
}

export interface RunTuningOptions {
  input: TuningInput;
  anthropic?: AnthropicClient;
  toolsOverride?: ToolDef[];
}

export interface TuningResponse {
  session_id: string;
  proposals: ArchitectProposalRow[];
  rejected: { cluster_key: string; reason: string }[];
  summary: string;
  cost_usd: number;
  duration_ms: number;
  status: ArchitectSessionStatus;
}

export async function runTuning(opts: RunTuningOptions): Promise<TuningResponse> {
  const verticalId = opts.input.vertical_id || 'pathfinder-default';
  const windowDays = opts.input.feedback_window_days ?? 7;
  const trigger = opts.input.trigger ?? 'cron';
  const store = getSessionStore();

  const session = await store.createSession({
    vertical_id: verticalId,
    session_type: 'tuning',
    trigger,
    input_payload: {
      vertical_id: verticalId,
      feedback_window_days: windowDays,
      prompt_version: TUNING_PROMPT_VERSION,
    },
  });
  const startedAt = Date.now();

  // Wrap createTuningProposal handler so every call is captured into a
  // session-scoped buffer.
  const staged: StagedProposal[] = [];
  const baseTools = opts.toolsOverride ?? TUNING_TOOLS;
  const tools: ToolDef[] = baseTools.map((t) =>
    t.name === TUNING_PROPOSAL_TOOL_NAME
      ? {
          ...t,
          handler: async (input) => {
            const validation = validateStagedProposal(input as Record<string, unknown>);
            if (!validation.ok) {
              return { ok: false, error: validation.error };
            }
            staged.push(validation.proposal);
            return { ok: true, proposal_index: staged.length };
          },
        }
      : t,
  );

  const initialUserMessage =
    `Run a tuning session for vertical "${verticalId}" over the last ${windowDays} days. ` +
    'Use the workflow in your system prompt: queryFeedback → analyzeRejectionPatterns → loadAgent → draftPromptRevision → runShadowTest → createTuningProposal → finalizeTuningRun. ' +
    'Be conservative: only propose changes for clusters with 3+ thumbs-down and shadow tests showing >50% reduction with <10% side effects. ' +
    'Cap total proposals at 5 per session.';

  let loopResult: AgentLoopResult | null = null;
  let runError: Error | null = null;
  try {
    loopResult = await runAgentLoop({
      systemPrompt: TUNING_SYSTEM_PROMPT,
      initialUserMessage,
      tools,
      finalToolName: TUNING_FINAL_TOOL_NAME,
      model: TUNING_MODEL,
      maxTurns: TUNING_MAX_TURNS,
      costCapUsd: SESSION_COST_CAP_USD.tuning,
      timeoutMs: SESSION_TIMEOUT_MS.tuning,
      sessionId: session.id,
      agentName: 'architect-tuning',
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
    | { proposed_count?: number; rejected_clusters?: { cluster_key: string; reason: string }[]; summary?: string }
    | null;

  // Persist staged proposals (those that passed handler-level validation).
  // Respect the spec §4 ceiling of 5 proposals per session.
  const accepted = staged.slice(0, 5).filter((p) => {
    return (
      p.cluster_count >= 3 &&
      p.shadow_test.win_rate > 0.5 &&
      p.shadow_test.side_effect_rate < 0.1
    );
  });
  const rejectedFromGates: { cluster_key: string; reason: string }[] = staged
    .slice(0, 5)
    .filter((p) => !(p.cluster_count >= 3 && p.shadow_test.win_rate > 0.5 && p.shadow_test.side_effect_rate < 0.1))
    .map((p) => ({
      cluster_key: p.cluster_key,
      reason: `gate-fail: count=${p.cluster_count}, win_rate=${p.shadow_test.win_rate}, side_effect_rate=${p.shadow_test.side_effect_rate}`,
    }));

  const overflow = staged.length > 5 ? staged.length - 5 : 0;
  if (overflow > 0) {
    rejectedFromGates.push({ cluster_key: 'overflow', reason: `${overflow} proposals beyond 5-per-session cap` });
  }

  const rejected = [
    ...(finalSummary?.rejected_clusters ?? []),
    ...rejectedFromGates,
  ];

  const persistedProposals: ArchitectProposalRow[] = [];
  for (const p of accepted) {
    const row = await store.createProposal({
      session_id: session.id,
      vertical_id: verticalId,
      type: 'tuning_suggestion',
      headline: p.headline,
      body: p.body ?? buildTuningBody(p),
      details: p as unknown as Record<string, unknown>,
      confidence: clamp01(p.confidence),
    });
    persistedProposals.push(row);
  }

  const status: ArchitectSessionStatus =
    loopResult.status === 'completed'
      ? 'completed'
      : loopResult.status;

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

function validateStagedProposal(
  input: Record<string, unknown>,
): { ok: true; proposal: StagedProposal } | { ok: false; error: string } {
  const headline = String(input.headline ?? '');
  const role = String(input.role ?? '');
  const cluster_key = String(input.cluster_key ?? '');
  const cluster_count = Number(input.cluster_count ?? 0);
  const current_instruction = String(input.current_instruction ?? '');
  const proposed_instruction = String(input.proposed_instruction ?? '');
  const confidence = Number(input.confidence ?? 0);
  const estimated_impact = String(input.estimated_impact ?? '');
  const shadow_test = (input.shadow_test ?? {}) as Record<string, unknown>;

  if (!headline) return { ok: false, error: 'headline required' };
  if (!role) return { ok: false, error: 'role required' };
  if (!cluster_key) return { ok: false, error: 'cluster_key required' };
  if (cluster_count < 3) return { ok: false, error: `cluster_count ${cluster_count} below the 3-min spec gate` };
  if (proposed_instruction.length < 30) return { ok: false, error: 'proposed_instruction too short' };
  if (proposed_instruction === current_instruction) return { ok: false, error: 'proposed_instruction unchanged' };
  if (!estimated_impact) return { ok: false, error: 'estimated_impact required' };

  const win_rate = Number(shadow_test.win_rate ?? 0);
  const side_effect_rate = Number(shadow_test.side_effect_rate ?? 1);
  return {
    ok: true,
    proposal: {
      headline,
      body: input.body ? String(input.body) : undefined,
      role,
      cluster_key,
      cluster_count,
      example_reasons: Array.isArray(input.example_reasons)
        ? input.example_reasons.map(String)
        : [],
      current_instruction,
      proposed_instruction,
      shadow_test: {
        sample_size: Number(shadow_test.sample_size ?? 0),
        wins: Number(shadow_test.wins ?? 0),
        losses: Number(shadow_test.losses ?? 0),
        side_effects: Number(shadow_test.side_effects ?? 0),
        win_rate,
        side_effect_rate,
        method: shadow_test.method ? String(shadow_test.method) : undefined,
      },
      confidence: clamp01(confidence),
      estimated_impact,
    },
  };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function buildTuningBody(p: StagedProposal): string {
  return `Cluster "${p.cluster_key}" (${p.cluster_count} negative-feedback rows). Affects: ${p.role}. Estimated impact: ${p.estimated_impact}. Shadow test (estimated, not measured): wins=${p.shadow_test.wins}/${p.shadow_test.sample_size} (${(p.shadow_test.win_rate * 100).toFixed(0)}%), side_effects=${p.shadow_test.side_effects} (${(p.shadow_test.side_effect_rate * 100).toFixed(0)}%).`;
}

// Re-export for tests / external orchestrators that need the public type.
export type { TuningProposal };
