import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ActivityFeed } from './ActivityFeed';

const orderMock = vi.fn();
const limitMock = vi.fn();

const subscribeMock = vi.fn();
const onMock = vi.fn(() => ({ subscribe: subscribeMock }));
const channelMock = vi.fn(() => ({ on: onMock }));
const removeChannelMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          order: orderMock,
        }),
      }),
    }),
    channel: channelMock,
    removeChannel: removeChannelMock,
  }),
}));

beforeEach(() => {
  orderMock.mockReturnValue({ limit: limitMock });
  limitMock.mockResolvedValue({ data: [], error: null });
  subscribeMock.mockReturnValue({});
  onMock.mockClear();
  channelMock.mockClear();
  removeChannelMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('<ActivityFeed />', () => {
  it('shows the loading state on first render', () => {
    render(<ActivityFeed onArchitectClick={() => {}} />);
    expect(screen.getByText(/loading activity/i)).toBeInTheDocument();
  });

  it('shows the empty state once the initial query resolves with no rows', async () => {
    render(<ActivityFeed onArchitectClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    });
  });

  it('renders rows from the initial query', async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          agent_name: 'ingestor',
          event_type: 'new_event',
          event_data: { detail: 'Sacramento County permit' },
          latency_ms: 200,
          model_used: null,
          ts: new Date().toISOString(),
        },
      ],
      error: null,
    });

    render(<ActivityFeed onArchitectClick={() => {}} />);

    await waitFor(() => {
      expect(
        screen.getByText(/ingestor · new_event · Sacramento County permit/i),
      ).toBeInTheDocument();
    });
  });

  it('surfaces query errors instead of silently rendering empty', async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    render(<ActivityFeed onArchitectClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    });
  });

  it('subscribes to the agent_log Realtime channel and unsubscribes on unmount', async () => {
    const { unmount } = render(<ActivityFeed onArchitectClick={() => {}} />);
    await waitFor(() => expect(channelMock).toHaveBeenCalledWith('unicron-activity-feed'));
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', schema: 'pathfinder', table: 'agent_log' }),
      expect.any(Function),
    );
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });
});
