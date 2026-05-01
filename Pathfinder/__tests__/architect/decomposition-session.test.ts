// __tests__/architect/decomposition-session.test.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3.
//
// End-to-end test of the decomposition session orchestrator with a fully
// mocked Anthropic client and SessionStore. Verifies:
//   - session row created with correct shape
//   - reasoning_log persisted
//   - validation downgrades architecture_confidence on structural failures
//   - architect_proposals row created on success

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

vi.mock('@/lib/llm/recorder', () => ({
  recordLLMCall: vi.fn(),
}));

import {
  setSessionStoreForTesting,
  type SessionStore,
} from '@/services/architect/runtime/session-store';
import { runDecomposition } from '@/services/architect/sessions/decomposition';
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
      input_tokens: opts.inputTokens ?? 50,
      output_tokens: opts.outputTokens ?? 30,
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
        if (!r) throw new Error('mock client exhausted');
        i += 1;
        return r;
      }),
    },
  };
}

function fakeStore() {
  const rows: { sessions: unknown[]; proposals: unknown[] } = { sessions: [], proposals: [] };
  let lastUpdate: unknown = null;
  const store: SessionStore = {
    createSession: vi.fn(async (input) => {
      const row = {
        id: 'sess_fake',
        ...input,
        reasoning_log: [],
        output_payload: null,
        status: 'in_progress' as const,
        failure_reason: null,
        duration_ms: null,
        cost_usd: 0,
        turns: 0,
        customer_org_id: input.customer_org_id ?? null,
        created_at: new Date().toISOString(),
        completed_at: null,
      };
      rows.sessions.push(row);
      return row as unknown as Awaited<ReturnType<SessionStore['createSession']>>;
    }),
    updateSession: vi.fn(async (id, patch) => {
      lastUpdate = { id, patch };
    }),
    createProposal: vi.fn(async (input) => {
      const row = {
        id: 'prop_fake',
        ...input,
        body: input.body ?? null,
        status: 'pending' as const,
        resolved_at: null,
        resolved_by_user_email: null,
        resolution_notes: null,
        source_input_summary: input.source_input_summary ?? null,
        created_at: new Date().toISOString(),
      };
      rows.proposals.push(row);
      return row as unknown as Awaited<ReturnType<SessionStore['createProposal']>>;
    }),
  };
  return { store, rows, getLastUpdate: () => lastUpdate };
}

const validProposal = {
  buyer: 'physical-security-services',
  buying_signal: 'new construction site needing temporary security',
  data_sources_proposed: [
    {
      type: 'harris-county-permits',
      jurisdictions: ['TX-Harris'],
      expected_daily_volume: 80,
    },
  ],
  data_sources_rejected: [
    { type: 'sec-edgar', reason: 'not relevant to construction-site security' },
  ],
  layer_2_watchers: [
    { source_type: 'harris-county-permits', instruction: 'poll the Harris County permit feed daily' },
  ],
  layer_3_agents: [
    {
      role: 'qualifier',
      instruction: 'Score permit issuance for likelihood of needing physical security services on-site.',
    },
    {
      role: 'enricher',
      instruction: 'Add project value, expected duration, and contact-of-record to the qualified signal.',
    },
  ],
  layer_4_agents: [
    {
      role: 'ranker',
      instruction: 'Rank verified permits 0-100 based on value + duration + branch proximity.',
    },
    {
      role: 'outreach-drafter',
      instruction: 'Draft a 3-channel outreach pitching temporary security to the project owner.',
    },
  ],
  estimates: {
    daily_qualified_volume: 12,
    cost_per_lead_usd: 0.04,
    architecture_confidence: 'high',
  },
  open_questions: [],
};

describe('runDecomposition — happy path', () => {
  beforeEach(() => {
    setSessionStoreForTesting(null);
  });
  afterEach(() => {
    setSessionStoreForTesting(null);
  });

  it('persists the session and proposal when the model finalizes a valid arch', async () => {
    const { store, rows } = fakeStore();
    setSessionStoreForTesting(store);

    const client = makeMockClient([
      mockMessage({
        text: 'Looking up sources for construction site security.',
        toolUses: [{ id: 't1', name: 'searchSourceTypes', input: { industry: 'construction' } }],
      }),
      mockMessage({
        text: 'Finalizing.',
        toolUses: [{ id: 't2', name: 'finalizeProposal', input: validProposal }],
      }),
    ]);

    const result = await runDecomposition({
      input: {
        buyer_pain_prompt:
          'I want to find construction sites in Houston that need temporary security guards.',
      },
      anthropic: client,
    });

    expect(result.status).toBe('completed');
    expect(result.proposal_id).toBe('prop_fake');
    expect(result.session_id).toBe('sess_fake');
    expect(result.architecture.estimates.architecture_confidence).toBe('high');
    expect(rows.sessions).toHaveLength(1);
    expect(rows.proposals).toHaveLength(1);
    expect(store.updateSession).toHaveBeenCalled();
  });

  it('downgrades to confidence=low when finalize bypasses validateArchitecture', async () => {
    const { store } = fakeStore();
    setSessionStoreForTesting(store);

    const badProposal = {
      ...validProposal,
      data_sources_proposed: [], // empty → validateArchitecture fails
      layer_2_watchers: [],
    };

    const client = makeMockClient([
      mockMessage({
        toolUses: [{ id: 't1', name: 'finalizeProposal', input: badProposal }],
      }),
    ]);

    const result = await runDecomposition({
      input: {
        buyer_pain_prompt: 'a buyer pain prompt long enough to pass minimum length',
      },
      anthropic: client,
    });

    expect(result.status).toBe('completed');
    expect(result.architecture.estimates.architecture_confidence).toBe('low');
    expect(result.architecture.open_questions.some((q) => /validation:/.test(q))).toBe(true);
  });
});

describe('runDecomposition — input validation', () => {
  beforeEach(() => {
    setSessionStoreForTesting(null);
  });

  it('rejects too-short buyer_pain_prompt', async () => {
    await expect(
      runDecomposition({
        input: { buyer_pain_prompt: 'short' },
      }),
    ).rejects.toThrow(/at least 10/);
  });
});

describe('runDecomposition — failure modes', () => {
  beforeEach(() => {
    setSessionStoreForTesting(null);
  });

  it('persists failure and throws when the agent loop fails terminally', async () => {
    const { store } = fakeStore();
    setSessionStoreForTesting(store);

    // Model ends without calling finalize → loop returns status='failed'.
    const client = makeMockClient([mockMessage({ text: 'all done, but no finalize' })]);

    await expect(
      runDecomposition({
        input: {
          buyer_pain_prompt: 'a long enough buyer pain prompt to pass the input check',
        },
        anthropic: client,
      }),
    ).rejects.toThrow();

    expect(store.updateSession).toHaveBeenCalled();
  });
});
