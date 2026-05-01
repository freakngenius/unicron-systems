// __tests__/architect/tuning-session.test.ts — Phase 2 Stream D Gate D2.
// Spec: SPEC - Architect Agent.md §4.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

vi.mock('@/lib/llm/recorder', () => ({ recordLLMCall: vi.fn() }));

import {
  setSessionStoreForTesting,
  type SessionStore,
} from '@/services/architect/runtime/session-store';
import {
  setFeedbackStoreForTesting,
  type FeedbackStore,
} from '@/services/architect/tools/feedback-store';
import { runTuning } from '@/services/architect/sessions/tuning';
import type { AnthropicClient } from '@/services/architect/runtime/agent-loop';

function mockMessage(opts: {
  toolUses?: { id: string; name: string; input: unknown }[];
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Anthropic.Message {
  const content: Array<
    { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
  > = [];
  if (opts.text) content.push({ type: 'text', text: opts.text });
  for (const tu of opts.toolUses ?? []) {
    content.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
  }
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: content as unknown as Anthropic.ContentBlock[],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: opts.inputTokens ?? 30,
      output_tokens: opts.outputTokens ?? 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Anthropic.Usage,
  } as Anthropic.Message;
}

function makeMockClient(responses: Anthropic.Message[]): AnthropicClient {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const r = responses[i];
        if (!r) throw new Error('exhausted');
        i += 1;
        return r;
      }),
    },
  };
}

function fakeSessionStore() {
  const proposals: unknown[] = [];
  const sessions: unknown[] = [];
  const store: SessionStore = {
    createSession: vi.fn(async (input) => {
      const row = {
        id: 'sess-tune',
        ...input,
        reasoning_log: [],
        output_payload: null,
        status: 'in_progress' as const,
        failure_reason: null,
        duration_ms: null,
        cost_usd: 0,
        turns: 0,
        customer_org_id: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      };
      sessions.push(row);
      return row as unknown as Awaited<ReturnType<SessionStore['createSession']>>;
    }),
    updateSession: vi.fn(async () => {}),
    createProposal: vi.fn(async (input) => {
      const row = {
        id: `prop-${proposals.length + 1}`,
        ...input,
        body: input.body ?? null,
        status: 'pending' as const,
        resolved_at: null,
        resolved_by_user_email: null,
        resolution_notes: null,
        source_input_summary: input.source_input_summary ?? null,
        created_at: new Date().toISOString(),
      };
      proposals.push(row);
      return row as unknown as Awaited<ReturnType<SessionStore['createProposal']>>;
    }),
  };
  return { store, proposals };
}

function fakeFeedbackStore(): FeedbackStore {
  return {
    loadFeedback: vi.fn(async () => []),
    loadAgentInstruction: vi.fn(async () => 'current instruction stub'),
  };
}

const validProposalInput = {
  headline: 'Tighten geo-mapper coverage check',
  role: 'geo-mapper',
  cluster_key: 'wrong-geography-outside-coverage',
  cluster_count: 4,
  example_reasons: ['wrong geography — Florida', 'wrong geography — California'],
  current_instruction: 'Map signal to nearest branch.',
  proposed_instruction:
    'Map signal to nearest branch. Reject signals more than 200 miles from any branch.',
  shadow_test: {
    sample_size: 10,
    wins: 8,
    losses: 2,
    side_effects: 0,
    win_rate: 0.8,
    side_effect_rate: 0,
    method: 'model_introspective_estimate',
  },
  confidence: 0.75,
  estimated_impact: '-80% wrong-geography dismissals, ~3% volume drop',
};

describe('runTuning — happy path', () => {
  beforeEach(() => {
    setSessionStoreForTesting(null);
    setFeedbackStoreForTesting(null);
  });
  afterEach(() => {
    setSessionStoreForTesting(null);
    setFeedbackStoreForTesting(null);
  });

  it('persists multiple proposals when the model calls createTuningProposal repeatedly', async () => {
    const { store, proposals } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setFeedbackStoreForTesting(fakeFeedbackStore());

    const client = makeMockClient([
      mockMessage({
        toolUses: [{ id: 't1', name: 'createTuningProposal', input: validProposalInput }],
      }),
      mockMessage({
        toolUses: [
          {
            id: 't2',
            name: 'createTuningProposal',
            input: {
              ...validProposalInput,
              cluster_key: 'too-aggressive',
              role: 'outreach-drafter',
              proposed_instruction:
                'Soften the opener; lead with the project context, not the pitch.',
            },
          },
        ],
      }),
      mockMessage({
        toolUses: [
          {
            id: 't3',
            name: 'finalizeTuningRun',
            input: { proposed_count: 2, summary: 'Two proposals staged.' },
          },
        ],
      }),
    ]);

    const result = await runTuning({
      input: { vertical_id: 'pathfinder-default', feedback_window_days: 7 },
      anthropic: client,
    });

    expect(result.status).toBe('completed');
    expect(result.proposals).toHaveLength(2);
    expect(proposals).toHaveLength(2);
    expect(result.proposals[0].type).toBe('tuning_suggestion');
  });
});

describe('runTuning — gate enforcement', () => {
  beforeEach(() => {
    setSessionStoreForTesting(null);
    setFeedbackStoreForTesting(null);
  });

  it('rejects proposals with cluster_count < 3 at handler validation', async () => {
    const { store, proposals } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setFeedbackStoreForTesting(fakeFeedbackStore());

    const client = makeMockClient([
      mockMessage({
        toolUses: [
          {
            id: 't1',
            name: 'createTuningProposal',
            input: { ...validProposalInput, cluster_count: 1 },
          },
        ],
      }),
      mockMessage({
        toolUses: [
          {
            id: 't2',
            name: 'finalizeTuningRun',
            input: { proposed_count: 0, summary: 'No clusters met the bar.' },
          },
        ],
      }),
    ]);

    const result = await runTuning({
      input: { vertical_id: 'pathfinder-default' },
      anthropic: client,
    });
    expect(result.proposals).toHaveLength(0);
    expect(proposals).toHaveLength(0);
  });

  it('caps proposals at 5 per session', async () => {
    const { store } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setFeedbackStoreForTesting(fakeFeedbackStore());

    const responses = [];
    for (let i = 0; i < 7; i++) {
      responses.push(
        mockMessage({
          toolUses: [
            {
              id: `t${i}`,
              name: 'createTuningProposal',
              input: { ...validProposalInput, cluster_key: `c-${i}` },
            },
          ],
        }),
      );
    }
    responses.push(
      mockMessage({
        toolUses: [
          {
            id: 'tF',
            name: 'finalizeTuningRun',
            input: { proposed_count: 7, summary: 'too many' },
          },
        ],
      }),
    );

    const result = await runTuning({
      input: { vertical_id: 'pathfinder-default' },
      anthropic: makeMockClient(responses),
    });

    expect(result.proposals.length).toBeLessThanOrEqual(5);
    expect(result.rejected.some((r) => r.cluster_key === 'overflow')).toBe(true);
  });

  it('rejects proposals where shadow_test.win_rate <= 0.5', async () => {
    const { store } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setFeedbackStoreForTesting(fakeFeedbackStore());

    const client = makeMockClient([
      mockMessage({
        toolUses: [
          {
            id: 't1',
            name: 'createTuningProposal',
            input: {
              ...validProposalInput,
              shadow_test: {
                ...validProposalInput.shadow_test,
                win_rate: 0.4,
              },
            },
          },
        ],
      }),
      mockMessage({
        toolUses: [
          {
            id: 't2',
            name: 'finalizeTuningRun',
            input: { proposed_count: 0, summary: 'win-rate too low' },
          },
        ],
      }),
    ]);

    const result = await runTuning({
      input: { vertical_id: 'pathfinder-default' },
      anthropic: client,
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.rejected.some((r) => /gate-fail/.test(r.reason))).toBe(true);
  });
});
