import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAgentRuns } from './agentRuns';

const limitMock = vi.fn();
const orderMock = vi.fn(() => ({ limit: limitMock }));

let realtimeHandler: ((payload: { new: unknown }) => void) | null = null;
const subscribeMock = vi.fn();
const onMock = vi.fn((_: string, _filter: unknown, handler: (p: { new: unknown }) => void) => {
  realtimeHandler = handler;
  return { subscribe: subscribeMock, on: onMock };
});
const channelMock = vi.fn(() => ({ on: onMock }));
const removeChannelMock = vi.fn();

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({ order: orderMock }),
      }),
    }),
    channel: channelMock,
    removeChannel: removeChannelMock,
  }),
}));

beforeEach(() => {
  realtimeHandler = null;
  limitMock.mockResolvedValue({ data: [], error: null });
  subscribeMock.mockReturnValue({});
  onMock.mockClear();
  channelMock.mockClear();
  removeChannelMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAgentRuns', () => {
  it('returns empty state initially and resolves to no rows', async () => {
    const { result } = renderHook(() => useAgentRuns());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
    expect(result.current.lastPulse).toBeNull();
  });

  it('emits a pulse when a single Realtime INSERT lands', async () => {
    const { result } = renderHook(() => useAgentRuns());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      realtimeHandler?.({
        new: {
          id: 11,
          agent_name: 'ranker',
          started_at: '2026-05-01T12:00:00Z',
          completed_at: null,
          records_processed: 4,
          records_new: 2,
          status: 'success',
          error_message: null,
        },
      });
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.lastPulse).toEqual(
      expect.objectContaining({ agentName: 'ranker', runId: 11, key: 1 }),
    );
  });

  it('caps rows at the limit during a burst of inserts', async () => {
    const { result } = renderHook(() => useAgentRuns(3));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      for (let i = 1; i <= 5; i++) {
        realtimeHandler?.({
          new: {
            id: i,
            agent_name: 'ingestor',
            started_at: new Date().toISOString(),
            completed_at: null,
            records_processed: 1,
            records_new: 1,
            status: 'success',
            error_message: null,
          },
        });
      }
    });

    expect(result.current.rows).toHaveLength(3);
    // Most-recent first; we inserted 5 last, so the head should be id=5.
    expect(result.current.rows[0].id).toBe(5);
    expect(result.current.lastPulse?.key).toBe(5);
  });

  it('tears down the Realtime channel on unmount', async () => {
    const { result, unmount } = renderHook(() => useAgentRuns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(channelMock).toHaveBeenCalledWith('unicron-agent-runs');
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it('surfaces query errors instead of leaving loading true', async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useAgentRuns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
  });
});
