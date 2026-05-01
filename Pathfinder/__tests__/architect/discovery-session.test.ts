// __tests__/architect/discovery-session.test.ts — Phase 2 Stream D Gate D3.
// Spec: SPEC - Architect Agent.md §5.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

vi.mock('@/lib/llm/recorder', () => ({ recordLLMCall: vi.fn() }));

import {
  setSessionStoreForTesting,
  type SessionStore,
} from '@/services/architect/runtime/session-store';
import {
  setSignalStoreForTesting,
  type SignalStore,
} from '@/services/architect/tools/signal-store';
import { runDiscovery } from '@/services/architect/sessions/discovery';
import type { AnthropicClient } from '@/services/architect/runtime/agent-loop';

function mockMessage(opts: {
  toolUses?: { id: string; name: string; input: unknown }[];
  text?: string;
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
      input_tokens: 30,
      output_tokens: 20,
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
  const store: SessionStore = {
    createSession: vi.fn(async (input) => ({
      id: 'sess-discover',
      ...input,
      reasoning_log: [],
      output_payload: null,
      status: 'in_progress' as const,
      failure_reason: null,
      duration_ms: null,
      cost_usd: 0,
      turns: 0,
      customer_org_id: null,
      created_at: '',
      completed_at: null,
    } as unknown as Awaited<ReturnType<SessionStore['createSession']>>)),
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
        source_input_summary: null,
        created_at: '',
      };
      proposals.push(row);
      return row as unknown as Awaited<ReturnType<SessionStore['createProposal']>>;
    }),
  };
  return { store, proposals };
}

const fakeSignalStore: SignalStore = {
  loadQualifiedSignals: vi.fn(async () => []),
  loadCurrentlyWatchedSourceTypes: vi.fn(async () => ['usaspending', 'sam.gov', 'harris-county-permits']),
};

const validSourceProposal = {
  headline: 'Add Austin TX permits — Travis County',
  candidate_jurisdiction: 'TX-Travis',
  source_type: 'austin-tx-permits',
  source_url: 'https://data.austintexas.gov/dataset/Permits-Issued/3syk-w9eu',
  source_name: 'City of Austin building permits',
  tier: 'tier_1',
  reference_count: 18,
  reference_rate: 0.18,
  lift_per_day: 4.8,
  confidence: 0.7,
  reasoning:
    'Travis County referenced in 18% of recent qualified signals; Austin Socrata permit feed is tier_1 and projects 4.8 qualified leads/day.',
};

describe('runDiscovery — happy path', () => {
  beforeEach(() => {
    setSessionStoreForTesting(null);
    setSignalStoreForTesting(null);
  });
  afterEach(() => {
    setSessionStoreForTesting(null);
    setSignalStoreForTesting(null);
  });

  it('persists a source_discovery proposal when gates are met', async () => {
    const { store, proposals } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setSignalStoreForTesting(fakeSignalStore);

    const client = makeMockClient([
      mockMessage({
        toolUses: [{ id: 't1', name: 'createSourceProposal', input: validSourceProposal }],
      }),
      mockMessage({
        toolUses: [
          {
            id: 't2',
            name: 'finalizeDiscoveryRun',
            input: { proposed_count: 1, summary: 'Travis added.' },
          },
        ],
      }),
    ]);

    const result = await runDiscovery({
      input: { vertical_id: 'pathfinder-default', trigger: 'manual' },
      anthropic: client,
    });

    expect(result.status).toBe('completed');
    expect(result.proposals).toHaveLength(1);
    expect(proposals).toHaveLength(1);
    expect((proposals[0] as { type: string }).type).toBe('source_discovery');
  });
});

describe('runDiscovery — gate enforcement', () => {
  beforeEach(() => {
    setSessionStoreForTesting(null);
    setSignalStoreForTesting(null);
  });

  it('rejects proposals with fake source_url at handler level', async () => {
    const { store, proposals } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setSignalStoreForTesting(fakeSignalStore);

    const client = makeMockClient([
      mockMessage({
        toolUses: [
          {
            id: 't1',
            name: 'createSourceProposal',
            input: { ...validSourceProposal, source_url: 'not-a-url' },
          },
        ],
      }),
      mockMessage({
        toolUses: [
          {
            id: 't2',
            name: 'finalizeDiscoveryRun',
            input: { proposed_count: 0, summary: 'no real URL' },
          },
        ],
      }),
    ]);

    const result = await runDiscovery({
      input: { vertical_id: 'pathfinder-default', trigger: 'manual' },
      anthropic: client,
    });
    expect(proposals).toHaveLength(0);
    expect(result.proposals).toHaveLength(0);
  });

  it('rejects below-15% reference_rate', async () => {
    const { store } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setSignalStoreForTesting(fakeSignalStore);

    const client = makeMockClient([
      mockMessage({
        toolUses: [
          {
            id: 't1',
            name: 'createSourceProposal',
            input: { ...validSourceProposal, reference_rate: 0.1 },
          },
        ],
      }),
      mockMessage({
        toolUses: [{ id: 't2', name: 'finalizeDiscoveryRun', input: { proposed_count: 0, summary: 'low ref' } }],
      }),
    ]);

    const result = await runDiscovery({
      input: { vertical_id: 'pathfinder-default', trigger: 'manual' },
      anthropic: client,
    });
    expect(result.proposals).toHaveLength(0);
  });

  it('dedupes same source_type+jurisdiction within a session', async () => {
    const { store } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setSignalStoreForTesting(fakeSignalStore);

    const client = makeMockClient([
      mockMessage({
        toolUses: [{ id: 't1', name: 'createSourceProposal', input: validSourceProposal }],
      }),
      mockMessage({
        toolUses: [{ id: 't2', name: 'createSourceProposal', input: validSourceProposal }],
      }),
      mockMessage({
        toolUses: [{ id: 't3', name: 'finalizeDiscoveryRun', input: { proposed_count: 1, summary: 'one' } }],
      }),
    ]);

    const result = await runDiscovery({
      input: { vertical_id: 'pathfinder-default', trigger: 'manual' },
      anthropic: client,
    });
    expect(result.proposals).toHaveLength(1);
  });

  it('caps proposals at 5 per session', async () => {
    const { store } = fakeSessionStore();
    setSessionStoreForTesting(store);
    setSignalStoreForTesting(fakeSignalStore);

    const responses = [];
    for (let i = 0; i < 7; i++) {
      responses.push(
        mockMessage({
          toolUses: [
            {
              id: `t${i}`,
              name: 'createSourceProposal',
              input: {
                ...validSourceProposal,
                source_type: `austin-tx-permits-${i}`,
                candidate_jurisdiction: `TX-${i}`,
              },
            },
          ],
        }),
      );
    }
    responses.push(
      mockMessage({
        toolUses: [{ id: 'tF', name: 'finalizeDiscoveryRun', input: { proposed_count: 7, summary: 'too many' } }],
      }),
    );

    const result = await runDiscovery({
      input: { vertical_id: 'pathfinder-default', trigger: 'manual' },
      anthropic: makeMockClient(responses),
    });
    expect(result.proposals.length).toBeLessThanOrEqual(5);
    expect(result.rejected.some((r) => r.candidate === 'overflow')).toBe(true);
  });
});
