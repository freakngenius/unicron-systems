// api/proposed-skills/approve.test.ts — Sprint 9 Stream B
//
// Approval-flow integration test:
//   - Taboo allow → inserts into nervous_system.skills with taboo_check_id,
//     proposal is marked approved.
//   - Taboo refuse → NO insert occurs, response 403, proposal stays queued
//     and taboo_flags is appended.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const state = {
  proposal: null as Record<string, unknown> | null,
  insertCalls: [] as Array<Record<string, unknown>>,
  updateProposalCalls: [] as Array<Record<string, unknown>>,
  insertedRow: null as Record<string, unknown> | null,
  tabooResult: {
    blocked: false as boolean,
    reason: undefined as string | undefined,
    matched_rule: undefined as string | undefined,
    taboo_check_id: 'taboo_check_test_id' as string | undefined,
  },
};

vi.mock('../../lib/skills/auth.js', () => ({
  checkSkillsAuth: vi.fn(async () => ({ ok: true, mode: 'internal' })),
}));

vi.mock('../../lib/skills/tabooKeeper.js', () => ({
  tabooCheckForSkillApproval: vi.fn(async () => state.tabooResult),
}));

vi.mock('../../lib/skills/supabase.js', () => {
  function proposalBuilder() {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = vi.fn(chain);
    b.eq = vi.fn(chain);
    b.maybeSingle = vi.fn(async () => ({ data: state.proposal, error: null }));
    b.update = vi.fn((patch: Record<string, unknown>) => {
      state.updateProposalCalls.push(patch);
      return b;
    });
    return b;
  }
  function skillsBuilder() {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = vi.fn(chain);
    b.eq = vi.fn(chain);
    b.insert = vi.fn((payload: Record<string, unknown>) => {
      state.insertCalls.push(payload);
      state.insertedRow = {
        id: 'sk_new_id',
        name: payload.name ?? 'unknown',
        version: payload.version ?? 1,
        lifecycle_status: payload.lifecycle_status,
        status: payload.status ?? 'active',
        customer_id: payload.customer_id ?? null,
        taboo_check_id: payload.taboo_check_id ?? null,
        created_at: new Date().toISOString(),
      };
      return b;
    });
    b.single = vi.fn(async () => ({ data: state.insertedRow, error: null }));
    return b;
  }
  return {
    getSkillsServiceClient: vi.fn(() => ({})),
    proposedSkillsTable: vi.fn(proposalBuilder),
    skillsTable: vi.fn(skillsBuilder),
    skillInvocationsTable: vi.fn(),
  };
});

import handler from './[id]/approve';

interface CapturedRes { status: number; body: unknown }

function mockReq(id: string, body: unknown): VercelRequest {
  return {
    method: 'POST',
    body,
    headers: {},
    query: { id },
  } as unknown as VercelRequest;
}

function mockRes(): { res: VercelResponse; captured: CapturedRes } {
  const captured: CapturedRes = { status: 200, body: null };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    setHeader() { return this; },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
    end() { return this; },
  } as unknown as VercelResponse;
  return { res, captured };
}

const QUEUED_PROPOSAL = {
  id: 'pr_1',
  proposed_skill: {
    name: 'run_zedcor_weekly_digest',
    description: 'Weekly digest',
    domain: 'sales',
    type: 'manual',
    inputs_schema: [],
    outputs_schema: [],
    refusal_gate: false,
    active: true,
    status: 'active',
    skill_md_path: 'wiki/skills/run-zedcor-weekly-digest.md',
  },
  customer_id: null,
  source_run_id: '00000000-0000-0000-0000-000000000001',
  status: 'queued',
  taboo_flags: [],
};

beforeEach(() => {
  state.proposal = { ...QUEUED_PROPOSAL };
  state.insertCalls = [];
  state.updateProposalCalls = [];
  state.insertedRow = null;
  state.tabooResult = {
    blocked: false,
    reason: undefined,
    matched_rule: undefined,
    taboo_check_id: 'taboo_check_test_id',
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/proposed-skills/:id/approve', () => {
  it('taboo allow → inserts skills row with taboo_check_id and marks proposal approved', async () => {
    state.tabooResult.blocked = false;
    state.tabooResult.taboo_check_id = 'taboo_check_abc';

    const { res, captured } = mockRes();
    await handler(mockReq('pr_1', {}), res);

    expect(captured.status).toBe(200);
    expect(state.insertCalls).toHaveLength(1);
    const inserted = state.insertCalls[0];
    expect(inserted.lifecycle_status).toBe('approved');
    expect(inserted.taboo_check_id).toBe('taboo_check_abc');
    expect(inserted.name).toBe('run_zedcor_weekly_digest');
    expect(inserted.author_kind).toBe('skill_forge');

    // Proposal was marked approved.
    const approvalUpdate = state.updateProposalCalls.find(
      (u) => u.status === 'approved',
    );
    expect(approvalUpdate).toBeDefined();
    expect((captured.body as { taboo_check_id: string }).taboo_check_id).toBe(
      'taboo_check_abc',
    );
  });

  it('taboo refuse → NO insert, 403 response, proposal stays queued, taboo_flags appended', async () => {
    state.tabooResult.blocked = true;
    state.tabooResult.reason = 'matches taboo: cross-tenant promotion';
    state.tabooResult.matched_rule = 'cross_tenant';
    state.tabooResult.taboo_check_id = undefined;

    const { res, captured } = mockRes();
    await handler(mockReq('pr_1', {}), res);

    expect(captured.status).toBe(403);
    expect(state.insertCalls).toHaveLength(0);

    // Proposal NOT marked approved.
    const approvalUpdate = state.updateProposalCalls.find(
      (u) => u.status === 'approved',
    );
    expect(approvalUpdate).toBeUndefined();

    // taboo_flags was appended.
    const flagUpdate = state.updateProposalCalls.find((u) => u.taboo_flags);
    expect(flagUpdate).toBeDefined();
    const flags = flagUpdate?.taboo_flags as unknown[];
    expect(Array.isArray(flags)).toBe(true);
    expect(flags.length).toBeGreaterThan(0);

    const body = captured.body as { blocked: boolean; reason: string };
    expect(body.blocked).toBe(true);
    expect(body.reason).toMatch(/cross-tenant/);
  });

  it('returns 404 if proposal not found', async () => {
    state.proposal = null;
    const { res, captured } = mockRes();
    await handler(mockReq('missing', {}), res);
    expect(captured.status).toBe(404);
  });

  it('returns 409 if proposal is not queued', async () => {
    state.proposal = { ...QUEUED_PROPOSAL, status: 'approved' };
    const { res, captured } = mockRes();
    await handler(mockReq('pr_1', {}), res);
    expect(captured.status).toBe(409);
    expect(state.insertCalls).toHaveLength(0);
  });
});
