// __tests__/email/threads.test.ts — Stream B Gate B3.
//
// recordOutboundThread + handleInboundReply, mocking @/lib/supabase and
// @/lib/deals so the orchestration is exercised without DB.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMaybeSingle = vi.fn();
const mockUpdateSingle = vi.fn();
const mockInsertSingle = vi.fn();
const mockDealMaybeSingle = vi.fn();
const mockMoveDealStage = vi.fn();
const mockRecordDealActivity = vi.fn();

let lastInsertRow: Record<string, unknown> | null = null;
let lastUpdateRow: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({}),
  },
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: (_cols?: string) => ({
        eq: (_c1: string, _v1: string) => ({
          eq: (_c2: string, _v2: string) => ({
            maybeSingle: () => (table === 'deals' ? mockDealMaybeSingle() : mockMaybeSingle()),
          }),
          maybeSingle: () => (table === 'deals' ? mockDealMaybeSingle() : mockMaybeSingle()),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        lastInsertRow = row;
        return {
          select: () => ({ single: () => mockInsertSingle() }),
        };
      },
      update: (row: Record<string, unknown>) => {
        lastUpdateRow = row;
        return {
          eq: (_c1: string, _v1: string) => ({
            eq: (_c2: string, _v2: string) => ({
              select: () => ({ single: () => mockUpdateSingle() }),
            }),
          }),
        };
      },
    }),
  }),
}));

vi.mock('@/lib/deals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/deals')>('@/lib/deals');
  return {
    ...actual,
    moveDealStage: (...args: unknown[]) => mockMoveDealStage(...args),
    recordDealActivity: (...args: unknown[]) => mockRecordDealActivity(...args),
  };
});

import { handleInboundReply, recordOutboundThread } from '@/lib/email/threads';

describe('recordOutboundThread', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockInsertSingle.mockReset();
    mockUpdateSingle.mockReset();
    lastInsertRow = null;
    lastUpdateRow = null;
  });

  it('inserts a new thread when none exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockInsertSingle.mockResolvedValueOnce({
      data: {
        id: 't-1',
        provider: 'gmail',
        provider_thread_id: 'thread-1',
        project_id: 'p-1',
        deal_id: null,
        actor_email: 'rep@zedcor.com',
        subject: 'Subj',
        recipient_email: 'joe@vendor.com',
        last_outbound_at: '2026-05-01T00:00:00Z',
        last_inbound_at: null,
        replied_at: null,
        message_count: 1,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    const r = await recordOutboundThread({
      provider: 'gmail',
      providerThreadId: 'thread-1',
      projectId: 'p-1',
      actorEmail: 'rep@zedcor.com',
      subject: 'Subj',
      recipientEmail: 'joe@vendor.com',
    });
    expect(r.id).toBe('t-1');
    expect(lastInsertRow?.message_count).toBe(1);
    expect(lastInsertRow?.last_outbound_at).not.toBeNull();
  });

  it('updates message_count + last_outbound_at when thread exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 't-2',
        provider: 'gmail',
        provider_thread_id: 'thread-2',
        project_id: 'p-1',
        deal_id: null,
        actor_email: 'rep@zedcor.com',
        subject: 'Subj',
        recipient_email: 'joe@vendor.com',
        last_outbound_at: '2026-05-01T00:00:00Z',
        last_inbound_at: null,
        replied_at: null,
        message_count: 1,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    mockUpdateSingle.mockResolvedValueOnce({
      data: {
        id: 't-2',
        message_count: 2,
      },
      error: null,
    });
    await recordOutboundThread({
      provider: 'gmail',
      providerThreadId: 'thread-2',
      projectId: 'p-1',
      actorEmail: 'rep@zedcor.com',
      subject: 'Different subject',
      recipientEmail: 'joe@vendor.com',
    });
    expect(lastUpdateRow?.message_count).toBe(2);
    expect(lastUpdateRow?.subject).toBe('Subj'); // preserved from first outbound
  });
});

describe('handleInboundReply', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockInsertSingle.mockReset();
    mockUpdateSingle.mockReset();
    mockDealMaybeSingle.mockReset();
    mockMoveDealStage.mockReset();
    mockRecordDealActivity.mockReset();
    lastInsertRow = null;
    lastUpdateRow = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns matched=false when thread is unknown', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const r = await handleInboundReply({
      provider: 'gmail',
      providerThreadId: 'unknown',
    });
    expect(r.matched).toBe(false);
    expect(mockMoveDealStage).not.toHaveBeenCalled();
  });

  it('flips deal stage to REPLIED on first reply when deal is in NEW', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 't-1',
        provider: 'gmail',
        provider_thread_id: 'thread-1',
        project_id: 'p-1',
        deal_id: 'd-1',
        actor_email: 'rep@zedcor.com',
        subject: 'Subj',
        recipient_email: 'joe@vendor.com',
        last_outbound_at: '2026-05-01T00:00:00Z',
        last_inbound_at: null,
        replied_at: null,
        message_count: 1,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    mockUpdateSingle.mockResolvedValueOnce({
      data: { id: 't-1', replied_at: '2026-05-01T01:00:00Z', message_count: 2 },
      error: null,
    });
    mockDealMaybeSingle.mockResolvedValueOnce({
      data: { id: 'd-1', pipeline_stage: 'NEW' },
      error: null,
    });
    mockMoveDealStage.mockResolvedValueOnce({
      deal: { id: 'd-1', pipeline_stage: 'REPLIED' },
      activity: { id: 'a-1' },
      noop: false,
    });
    mockRecordDealActivity.mockResolvedValueOnce({ id: 'a-2' });

    const r = await handleInboundReply({
      provider: 'gmail',
      providerThreadId: 'thread-1',
      providerMessageId: 'msg-1',
      fromEmail: 'joe@vendor.com',
      snippet: 'Yes please',
    });

    expect(r.matched).toBe(true);
    expect(r.dealStageChanged).toBe('REPLIED');
    expect(r.dealActivityRecorded).toBe(true);
    expect(mockMoveDealStage).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: 'd-1', toStage: 'REPLIED', actorEmail: 'system' }),
    );
    expect(mockRecordDealActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: 'd-1',
        activityType: 'reply_received',
      }),
    );
  });

  it('does NOT regress deal stage when already past REPLIED', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 't-2',
        provider: 'outlook',
        provider_thread_id: 'thread-2',
        project_id: 'p-2',
        deal_id: 'd-2',
        actor_email: 'rep@zedcor.com',
        subject: 'Subj',
        recipient_email: 'joe@vendor.com',
        last_outbound_at: '2026-05-01T00:00:00Z',
        last_inbound_at: null,
        replied_at: null,
        message_count: 1,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    mockUpdateSingle.mockResolvedValueOnce({
      data: { id: 't-2', replied_at: '2026-05-01T01:00:00Z' },
      error: null,
    });
    mockDealMaybeSingle.mockResolvedValueOnce({
      data: { id: 'd-2', pipeline_stage: 'PROPOSAL' },
      error: null,
    });
    mockRecordDealActivity.mockResolvedValueOnce({ id: 'a-3' });

    const r = await handleInboundReply({
      provider: 'outlook',
      providerThreadId: 'thread-2',
    });

    expect(r.matched).toBe(true);
    expect(r.dealStageChanged).toBeNull();
    expect(r.dealActivityRecorded).toBe(true);
    expect(mockMoveDealStage).not.toHaveBeenCalled();
    expect(mockRecordDealActivity).toHaveBeenCalledTimes(1);
  });

  it('records reply but no deal activity when thread has no deal_id', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 't-3',
        provider: 'gmail',
        provider_thread_id: 'thread-3',
        project_id: 'p-3',
        deal_id: null,
        actor_email: 'rep@zedcor.com',
        subject: 'Subj',
        recipient_email: 'joe@vendor.com',
        last_outbound_at: '2026-05-01T00:00:00Z',
        last_inbound_at: null,
        replied_at: null,
        message_count: 1,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    mockUpdateSingle.mockResolvedValueOnce({
      data: { id: 't-3', replied_at: '2026-05-01T01:00:00Z' },
      error: null,
    });

    const r = await handleInboundReply({
      provider: 'gmail',
      providerThreadId: 'thread-3',
    });

    expect(r.matched).toBe(true);
    expect(r.dealStageChanged).toBeFalsy();
    expect(r.dealActivityRecorded).toBeFalsy();
    expect(mockRecordDealActivity).not.toHaveBeenCalled();
  });

  it('does not flip stage on subsequent reply (replied_at already set)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 't-4',
        provider: 'gmail',
        provider_thread_id: 'thread-4',
        project_id: 'p-4',
        deal_id: 'd-4',
        actor_email: 'rep@zedcor.com',
        subject: 'Subj',
        recipient_email: 'joe@vendor.com',
        last_outbound_at: '2026-05-01T00:00:00Z',
        last_inbound_at: '2026-05-01T01:00:00Z',
        replied_at: '2026-05-01T01:00:00Z',
        message_count: 2,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T01:00:00Z',
      },
      error: null,
    });
    mockUpdateSingle.mockResolvedValueOnce({
      data: { id: 't-4' },
      error: null,
    });

    const r = await handleInboundReply({
      provider: 'gmail',
      providerThreadId: 'thread-4',
    });

    expect(r.matched).toBe(true);
    expect(mockMoveDealStage).not.toHaveBeenCalled();
    expect(mockRecordDealActivity).not.toHaveBeenCalled();
  });
});
