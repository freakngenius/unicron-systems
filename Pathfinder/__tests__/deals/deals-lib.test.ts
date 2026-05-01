// __tests__/deals/deals-lib.test.ts — Stream B Gate B1.
//
// Unit tests for lib/deals.ts: moveDealStage, recordDealActivity,
// createDeal, listDealsWithProjects. Mocks @/lib/supabase to exercise the
// write path without touching the DB.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock supabase ------------------------------------------------------

interface FakeRow extends Record<string, unknown> {}

interface FakeQuery {
  data: FakeRow | FakeRow[] | null;
  error: { message: string } | null;
}

const mockSelectSingle: ReturnType<typeof vi.fn> = vi.fn();
const mockUpdateSelectSingle: ReturnType<typeof vi.fn> = vi.fn();
const mockInsertSelectSingle: ReturnType<typeof vi.fn> = vi.fn();
const mockListResolve: ReturnType<typeof vi.fn> = vi.fn();

let lastInsertRow: Record<string, unknown> | null = null;
let lastUpdateRow: Record<string, unknown> | null = null;
let lastUpdateMatch: { col: string; val: unknown } | null = null;
let lastReadFilters: { table: string; col?: string; val?: unknown } | null = null;

function makeAdmin() {
  return {
    from: (table: string) => ({
      // listDealsWithProjects path
      select: (_cols?: string) => {
        return {
          // chained order().order().limit() → .eq() → resolve
          order: (_col: string, _opts?: unknown) => ({
            order: (_col2: string, _opts2?: unknown) => ({
              limit: (_n: number) => ({
                eq: (col: string, val: unknown) => {
                  lastReadFilters = { table, col, val };
                  return mockListResolve();
                },
                then: (resolve: (v: FakeQuery) => unknown) =>
                  mockListResolve().then(resolve),
              }),
            }),
            limit: (_n: number) => ({
              eq: (col: string, val: unknown) => {
                lastReadFilters = { table, col, val };
                return mockListResolve();
              },
              then: (resolve: (v: FakeQuery) => unknown) =>
                mockListResolve().then(resolve),
            }),
          }),
          // moveDealStage existing-read path: .eq().maybeSingle()
          eq: (col: string, val: unknown) => {
            lastReadFilters = { table, col, val };
            return {
              maybeSingle: () => mockSelectSingle(),
              single: () => mockSelectSingle(),
            };
          },
        };
      },
      insert: (row: Record<string, unknown>) => {
        lastInsertRow = row;
        return {
          select: () => ({ single: () => mockInsertSelectSingle() }),
        };
      },
      update: (row: Record<string, unknown>) => {
        lastUpdateRow = row;
        return {
          eq: (col: string, val: unknown) => {
            lastUpdateMatch = { col, val };
            return {
              select: () => ({ single: () => mockUpdateSelectSingle() }),
            };
          },
        };
      },
    }),
  };
}

vi.mock('@/lib/supabase', () => ({
  supabase: makeAdmin(),
  supabaseAdmin: () => makeAdmin(),
}));

import {
  createDeal,
  isDealPipelineStage,
  listDealsWithProjects,
  moveDealStage,
  recordDealActivity,
} from '@/lib/deals';

// ---- Tests --------------------------------------------------------------

describe('isDealPipelineStage', () => {
  it('recognizes the seven valid stages', () => {
    for (const s of ['NEW', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'WON', 'LOST']) {
      expect(isDealPipelineStage(s)).toBe(true);
    }
  });
  it('rejects unknown / lowercased / non-string', () => {
    expect(isDealPipelineStage('new')).toBe(false);
    expect(isDealPipelineStage('CLOSED')).toBe(false);
    expect(isDealPipelineStage(undefined)).toBe(false);
    expect(isDealPipelineStage(null)).toBe(false);
    expect(isDealPipelineStage(42)).toBe(false);
  });
});

describe('createDeal', () => {
  beforeEach(() => {
    mockInsertSelectSingle.mockReset();
    lastInsertRow = null;
  });

  it('inserts with default stage NEW when not specified', async () => {
    mockInsertSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'd-1',
        project_id: 'p-1',
        owner_email: null,
        pipeline_stage: 'NEW',
        value_usd: null,
        notes: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    const result = await createDeal({ projectId: 'p-1' });
    expect(result.pipeline_stage).toBe('NEW');
    expect(lastInsertRow?.project_id).toBe('p-1');
    expect(lastInsertRow?.pipeline_stage).toBe('NEW');
  });

  it('forwards owner + stage + value + notes', async () => {
    mockInsertSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'd-2',
        project_id: 'p-2',
        owner_email: 'rep@zedcor.com',
        pipeline_stage: 'CONTACTED',
        value_usd: 1500000,
        notes: 'sent intro',
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    await createDeal({
      projectId: 'p-2',
      ownerEmail: 'rep@zedcor.com',
      pipelineStage: 'CONTACTED',
      valueUsd: 1500000,
      notes: 'sent intro',
    });
    expect(lastInsertRow?.owner_email).toBe('rep@zedcor.com');
    expect(lastInsertRow?.pipeline_stage).toBe('CONTACTED');
    expect(lastInsertRow?.value_usd).toBe(1500000);
    expect(lastInsertRow?.notes).toBe('sent intro');
  });

  it('throws on supabase error', async () => {
    mockInsertSelectSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key' },
    });
    await expect(createDeal({ projectId: 'p-3' })).rejects.toThrow(/duplicate key/);
  });
});

describe('recordDealActivity', () => {
  beforeEach(() => {
    mockInsertSelectSingle.mockReset();
    lastInsertRow = null;
  });

  it('inserts activity with default empty payload', async () => {
    mockInsertSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'a-1',
        deal_id: 'd-1',
        activity_type: 'manual_note',
        from_stage: null,
        to_stage: null,
        payload: {},
        actor_email: null,
        created_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    await recordDealActivity({ dealId: 'd-1', activityType: 'manual_note' });
    expect(lastInsertRow?.deal_id).toBe('d-1');
    expect(lastInsertRow?.activity_type).toBe('manual_note');
    expect(lastInsertRow?.payload).toEqual({});
  });

  it('forwards from/to stage + payload + actor', async () => {
    mockInsertSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'a-2',
        deal_id: 'd-2',
        activity_type: 'stage_change',
        from_stage: 'NEW',
        to_stage: 'CONTACTED',
        payload: { source: 'kanban' },
        actor_email: 'rep@zedcor.com',
        created_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    await recordDealActivity({
      dealId: 'd-2',
      activityType: 'stage_change',
      fromStage: 'NEW',
      toStage: 'CONTACTED',
      payload: { source: 'kanban' },
      actorEmail: 'rep@zedcor.com',
    });
    expect(lastInsertRow?.from_stage).toBe('NEW');
    expect(lastInsertRow?.to_stage).toBe('CONTACTED');
    expect(lastInsertRow?.payload).toEqual({ source: 'kanban' });
    expect(lastInsertRow?.actor_email).toBe('rep@zedcor.com');
  });
});

describe('moveDealStage', () => {
  beforeEach(() => {
    mockSelectSingle.mockReset();
    mockUpdateSelectSingle.mockReset();
    mockInsertSelectSingle.mockReset();
    lastInsertRow = null;
    lastUpdateRow = null;
    lastUpdateMatch = null;
  });

  it('updates pipeline_stage and writes a stage_change activity', async () => {
    mockSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'd-1',
        project_id: 'p-1',
        owner_email: null,
        pipeline_stage: 'NEW',
        value_usd: null,
        notes: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    mockUpdateSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'd-1',
        project_id: 'p-1',
        owner_email: null,
        pipeline_stage: 'CONTACTED',
        value_usd: null,
        notes: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:01:00Z',
      },
      error: null,
    });
    mockInsertSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'a-1',
        deal_id: 'd-1',
        activity_type: 'stage_change',
        from_stage: 'NEW',
        to_stage: 'CONTACTED',
        payload: {},
        actor_email: 'rep@zedcor.com',
        created_at: '2026-05-01T00:01:00Z',
      },
      error: null,
    });

    const result = await moveDealStage({
      dealId: 'd-1',
      toStage: 'CONTACTED',
      actorEmail: 'rep@zedcor.com',
    });

    expect(result.noop).toBe(false);
    expect(result.deal.pipeline_stage).toBe('CONTACTED');
    expect(result.activity.from_stage).toBe('NEW');
    expect(result.activity.to_stage).toBe('CONTACTED');
    expect(lastUpdateRow).toEqual({ pipeline_stage: 'CONTACTED' });
    expect(lastUpdateMatch).toEqual({ col: 'id', val: 'd-1' });
    expect(lastInsertRow?.activity_type).toBe('stage_change');
    expect(lastInsertRow?.from_stage).toBe('NEW');
    expect(lastInsertRow?.to_stage).toBe('CONTACTED');
  });

  it('returns noop when from === to without updating or writing activity', async () => {
    mockSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'd-1',
        project_id: 'p-1',
        owner_email: null,
        pipeline_stage: 'CONTACTED',
        value_usd: null,
        notes: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });

    const result = await moveDealStage({ dealId: 'd-1', toStage: 'CONTACTED' });

    expect(result.noop).toBe(true);
    expect(result.deal.pipeline_stage).toBe('CONTACTED');
    expect(mockUpdateSelectSingle).not.toHaveBeenCalled();
    expect(mockInsertSelectSingle).not.toHaveBeenCalled();
  });

  it('throws when deal is not found', async () => {
    mockSelectSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      moveDealStage({ dealId: 'missing', toStage: 'CONTACTED' }),
    ).rejects.toThrow(/not found/);
  });

  it('propagates supabase update errors', async () => {
    mockSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'd-1',
        project_id: 'p-1',
        owner_email: null,
        pipeline_stage: 'NEW',
        value_usd: null,
        notes: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    mockUpdateSelectSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied' },
    });
    await expect(
      moveDealStage({ dealId: 'd-1', toStage: 'CONTACTED' }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('listDealsWithProjects', () => {
  beforeEach(() => {
    mockListResolve.mockReset();
    lastReadFilters = null;
  });

  it('drops rows whose project hydrate is missing', async () => {
    mockListResolve.mockResolvedValueOnce({
      data: [
        {
          id: 'd-1',
          project_id: 'p-1',
          owner_email: null,
          pipeline_stage: 'NEW',
          value_usd: null,
          notes: null,
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
          project: {
            id: 'p-1',
            title: 'Test project',
            project_value: 1_000_000,
            score: 80,
            verified: true,
            nearest_branch_id: 'b-1',
            distance_miles: 12,
            source: 'usaspending',
            project_stage: 'awarded',
          },
        },
        {
          id: 'd-2',
          project_id: 'p-orphan',
          owner_email: null,
          pipeline_stage: 'NEW',
          value_usd: null,
          notes: null,
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
          project: null,
        },
      ],
      error: null,
    });

    const result = await listDealsWithProjects();
    expect(result).toHaveLength(1);
    expect(result[0].project.title).toBe('Test project');
  });

  it('forwards stage filter to .eq', async () => {
    mockListResolve.mockResolvedValueOnce({ data: [], error: null });
    await listDealsWithProjects({ stage: 'CONTACTED' });
    expect(lastReadFilters).toEqual({ table: 'deals', col: 'pipeline_stage', val: 'CONTACTED' });
  });

  it('throws on supabase error', async () => {
    mockListResolve.mockResolvedValueOnce({
      data: null,
      error: { message: 'rls denied' },
    });
    await expect(listDealsWithProjects()).rejects.toThrow(/rls denied/);
  });
});
