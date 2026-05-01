// services/architect/tools/tuning.ts — Phase 2 Stream D Gate D2.
// Spec: SPEC - Architect Agent.md §4 (tuning tools).
//
// Tools per spec §4:
//   queryFeedback(vertical_id, since)             → Feedback[]
//   analyzeRejectionPatterns(feedback)            → RejectionPattern[]
//   loadAgent(role, vertical_id)                  → AgentDef
//   draftPromptRevision(currentInstruction,       → string
//                       observedFailures)
//   runShadowTest(agentId, candidateInstruction,  → ShadowTestResult
//                 sampleSize)
//   createProposal(...)                           → Proposal
//
// Plus runtime-only `finalizeTuningRun` that terminates the session.
//
// Drift from §4 — `runShadowTest` is a model-introspective estimator, not
// a true parallel-prompt re-run against historical signals. See
// services/architect/README.md "Tuning shadow-test caveat" + decisions.md
// for the rationale: a real shadow test would require re-running each
// historical lead through the candidate prompt, which is unbudgeted in
// Phase 2. The estimator gives the operator the same conservatism gates
// (>50% reduction, <10% side effects) and surfaces the limitation in the
// proposal body so the operator can decide how much to trust it.

import type { ToolDef } from '@/services/architect/runtime/agent-loop';
import { getFeedbackStore, type Feedback, type FeedbackKind } from './feedback-store';

// ----- queryFeedback -----------------------------------------------------

export const queryFeedbackTool: ToolDef = {
  name: 'queryFeedback',
  description:
    'Load recent feedback (lead accept/dismiss, slack actions, outreach edits) for a vertical. Returns up to 200 most-recent rows. Polarity is normalized: accept→positive, dismiss→negative, snooze/light_edit→neutral.',
  input_schema: {
    type: 'object',
    properties: {
      vertical_id: { type: 'string', description: 'Vertical id; default "pathfinder-default".' },
      window_days: { type: 'integer', description: 'Lookback window in days; default 7.' },
    },
    required: [],
  },
  handler: async (input: Record<string, unknown>) => {
    const verticalId = String(input.vertical_id ?? 'pathfinder-default');
    const windowDays = Number(input.window_days ?? 7);
    const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const store = getFeedbackStore();
    const feedback = (await store.loadFeedback(verticalId, sinceIso)).slice(-200);
    const counts: Record<string, number> = {};
    for (const f of feedback) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    return {
      vertical_id: verticalId,
      since: sinceIso,
      total: feedback.length,
      counts_by_kind: counts,
      feedback,
    };
  },
};

// ----- analyzeRejectionPatterns ------------------------------------------

interface RejectionPattern {
  cluster_key: string;            // normalized reason cluster
  count: number;
  example_reasons: string[];
  example_project_ids: string[];
  responsible_agents: string[];   // intersection of pipeline_trace across cluster
}

function clusterKey(reason: string | null): string {
  if (!reason) return 'unknown';
  const normalized = reason.toLowerCase().trim();
  // Cheap clustering by first 4 words. The agent reasons over the cluster
  // examples explicitly, so this just provides a deterministic grouping
  // primitive rather than full NLP.
  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean).slice(0, 4);
  return words.join('-') || 'unknown';
}

export const analyzeRejectionPatternsTool: ToolDef = {
  name: 'analyzeRejectionPatterns',
  description:
    'Cluster negative-polarity feedback rows by normalized reason. Returns clusters with count, example reasons, and the intersection of pipeline_trace agents (the agents that consistently appear in the lead pipelines for that cluster — the candidates for the responsible agent).',
  input_schema: {
    type: 'object',
    properties: {
      feedback: {
        type: 'array',
        description: 'Feedback rows to cluster (passes through queryFeedback output verbatim).',
      },
      min_cluster_size: {
        type: 'integer',
        description: 'Drop clusters below this threshold. Default 3 per spec §4 conservatism gate.',
      },
    },
    required: ['feedback'],
  },
  handler: (input: Record<string, unknown>) => {
    const feedback = (Array.isArray(input.feedback) ? input.feedback : []) as Feedback[];
    const minSize = Number(input.min_cluster_size ?? 3);
    const negatives = feedback.filter((f) => f.polarity === 'negative');
    const clusters = new Map<string, RejectionPattern>();
    for (const f of negatives) {
      const key = clusterKey(f.reason);
      const existing = clusters.get(key);
      if (existing) {
        existing.count += 1;
        if (f.reason && existing.example_reasons.length < 5) existing.example_reasons.push(f.reason);
        if (f.project_id && existing.example_project_ids.length < 5) {
          existing.example_project_ids.push(f.project_id);
        }
        // intersect responsible_agents with current pipeline_trace
        existing.responsible_agents = existing.responsible_agents.filter((a) =>
          f.pipeline_trace.includes(a),
        );
      } else {
        clusters.set(key, {
          cluster_key: key,
          count: 1,
          example_reasons: f.reason ? [f.reason] : [],
          example_project_ids: f.project_id ? [f.project_id] : [],
          responsible_agents: [...f.pipeline_trace],
        });
      }
    }
    const out = [...clusters.values()].filter((c) => c.count >= minSize);
    out.sort((a, b) => b.count - a.count);
    return {
      total_negative: negatives.length,
      cluster_count: out.length,
      clusters: out,
      dropped_below_threshold: clusters.size - out.length,
    };
  },
};

// ----- loadAgent ---------------------------------------------------------

export const loadAgentTool: ToolDef = {
  name: 'loadAgent',
  description:
    'Look up the current production instruction for an agent role. Returns null when the role has no editable per-vertical instruction yet (e.g., logic in code rather than a prompt template) — surface that as an open question in the proposal.',
  input_schema: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'Lowercase-kebab role name.' },
      vertical_id: { type: 'string' },
    },
    required: ['role'],
  },
  handler: async (input: Record<string, unknown>) => {
    const role = String(input.role ?? '');
    const vertical = String(input.vertical_id ?? 'pathfinder-default');
    const store = getFeedbackStore();
    const instruction = await store.loadAgentInstruction(role, vertical);
    return {
      role,
      vertical_id: vertical,
      has_editable_instruction: instruction != null,
      current_instruction: instruction,
    };
  },
};

// ----- draftPromptRevision -----------------------------------------------

export const draftPromptRevisionTool: ToolDef = {
  name: 'draftPromptRevision',
  description:
    'Normalize a candidate prompt revision proposed by you. Server-side this just validates length and echoes it back so the orchestrator can persist it verbatim. The actual drafting happens in the model — this tool is the structured handoff.',
  input_schema: {
    type: 'object',
    properties: {
      role: { type: 'string' },
      current_instruction: { type: 'string' },
      proposed_instruction: { type: 'string' },
      rationale: {
        type: 'string',
        description:
          'Why this revision addresses the failure cluster. Cite the cluster_key + example reasons.',
      },
    },
    required: ['role', 'current_instruction', 'proposed_instruction', 'rationale'],
  },
  handler: (input: Record<string, unknown>) => {
    const role = String(input.role ?? '');
    const proposed = String(input.proposed_instruction ?? '');
    const current = String(input.current_instruction ?? '');
    if (proposed.length < 30) return { ok: false, error: 'proposed_instruction too short (<30 chars)' };
    if (proposed === current) return { ok: false, error: 'proposed_instruction equal to current — no change' };
    return {
      ok: true,
      role,
      diff_chars: Math.abs(proposed.length - current.length),
    };
  },
};

// ----- runShadowTest -----------------------------------------------------

export const runShadowTestTool: ToolDef = {
  name: 'runShadowTest',
  description:
    'Estimate win-rate and side-effect-rate for a candidate instruction against a sample of historical failures. NOTE: this is a model-introspective estimator, not a parallel re-run against real signals. The orchestrator surfaces this caveat in the proposal body so operators know the win/loss numbers are estimated, not measured. You provide the estimates based on your reasoning over the cluster examples + the diff.',
  input_schema: {
    type: 'object',
    properties: {
      role: { type: 'string' },
      cluster_key: { type: 'string' },
      sample_size: { type: 'integer', description: 'Number of historical failures considered.' },
      estimated_wins: {
        type: 'integer',
        description: 'How many of the sample would the candidate prompt now handle correctly?',
      },
      estimated_losses: {
        type: 'integer',
        description: 'How many of the sample would still fail or fail in a new way?',
      },
      estimated_side_effects: {
        type: 'integer',
        description: 'How many previously-correct outputs might the new prompt change?',
      },
      reasoning: {
        type: 'string',
        description: 'One-paragraph justification of the estimates.',
      },
    },
    required: [
      'role',
      'cluster_key',
      'sample_size',
      'estimated_wins',
      'estimated_losses',
      'estimated_side_effects',
      'reasoning',
    ],
  },
  handler: (input: Record<string, unknown>) => {
    const sample = Math.max(1, Number(input.sample_size ?? 1));
    const wins = Math.max(0, Number(input.estimated_wins ?? 0));
    const losses = Math.max(0, Number(input.estimated_losses ?? 0));
    const sideEffects = Math.max(0, Number(input.estimated_side_effects ?? 0));
    const winRate = wins / sample;
    const sideEffectRate = sideEffects / sample;
    return {
      sample_size: sample,
      wins,
      losses,
      side_effects: sideEffects,
      win_rate: Number(winRate.toFixed(2)),
      side_effect_rate: Number(sideEffectRate.toFixed(2)),
      // Conservatism gate per spec §4.
      meets_propose_bar: winRate > 0.5 && sideEffectRate < 0.1,
      method: 'model_introspective_estimate',
    };
  },
};

// ----- createTuningProposal ----------------------------------------------

export const createTuningProposalTool: ToolDef = {
  name: 'createTuningProposal',
  description:
    'Stage one tuning_suggestion proposal for the Architect Inbox. The orchestrator persists this to architect_proposals after the session finalizes. Cluster must have count >= 3 and shadow test must meet_propose_bar=true (per spec §4 conservatism). The orchestrator re-validates these gates server-side.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'Inbox-card headline (one line).' },
      body: { type: 'string', description: 'Inbox-card body paragraph.' },
      role: { type: 'string', description: 'Affected agent role.' },
      cluster_key: { type: 'string' },
      cluster_count: { type: 'integer' },
      example_reasons: { type: 'array', items: { type: 'string' } },
      current_instruction: { type: 'string' },
      proposed_instruction: { type: 'string' },
      shadow_test: {
        type: 'object',
        properties: {
          sample_size: { type: 'integer' },
          wins: { type: 'integer' },
          losses: { type: 'integer' },
          side_effects: { type: 'integer' },
          win_rate: { type: 'number' },
          side_effect_rate: { type: 'number' },
          method: { type: 'string' },
        },
        required: ['sample_size', 'wins', 'losses', 'side_effects', 'win_rate', 'side_effect_rate'],
      },
      confidence: { type: 'number', description: '0..1' },
      estimated_impact: {
        type: 'string',
        description:
          'One-line impact estimate (e.g., "-84% wrong-geo dismissals, -3% total volume").',
      },
    },
    required: [
      'headline',
      'role',
      'cluster_key',
      'cluster_count',
      'current_instruction',
      'proposed_instruction',
      'shadow_test',
      'confidence',
      'estimated_impact',
    ],
  },
  handler: (input: Record<string, unknown>) => {
    return { ok: true, staged: input };
  },
};

// ----- finalizeTuningRun -------------------------------------------------

export const finalizeTuningRunTool: ToolDef = {
  name: 'finalizeTuningRun',
  description:
    'Submit the final tuning-session summary. Calling this terminates the session. Echo what was proposed and what was rejected (with reasons) so the operator can audit the session.',
  input_schema: {
    type: 'object',
    properties: {
      proposed_count: { type: 'integer' },
      rejected_clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cluster_key: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['cluster_key', 'reason'],
        },
      },
      summary: { type: 'string' },
    },
    required: ['proposed_count', 'summary'],
  },
  handler: () => ({ finalized: true }),
};

export const TUNING_TOOLS: ToolDef[] = [
  queryFeedbackTool,
  analyzeRejectionPatternsTool,
  loadAgentTool,
  draftPromptRevisionTool,
  runShadowTestTool,
  createTuningProposalTool,
  finalizeTuningRunTool,
];

export const TUNING_FINAL_TOOL_NAME = 'finalizeTuningRun';
export const TUNING_PROPOSAL_TOOL_NAME = 'createTuningProposal';
