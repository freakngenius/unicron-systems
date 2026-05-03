import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivitySidebar } from './ActivitySidebar';

const orderMock = vi.fn();
const limitMock = vi.fn();
const subscribeMock = vi.fn();
const onMock = vi.fn(() => ({ subscribe: subscribeMock }));
const channelMock = vi.fn(() => ({ on: onMock }));
const removeChannelMock = vi.fn();

// ActivityFeed (rendered inside the sidebar) hits Supabase on mount, so we
// stub it the same way the ActivityFeed test does.
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
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('<ActivitySidebar />', () => {
  it('renders collapsed by default with the open handle visible', () => {
    render(<ActivitySidebar onArchitectClick={() => {}} />);
    const panel = screen.getByTestId('activity-sidebar-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    const handle = screen.getByRole('button', { name: /show activity feed/i });
    expect(handle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands when the handle is clicked and shows the close button', async () => {
    render(<ActivitySidebar onArchitectClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /show activity feed/i }));

    const panel = screen.getByTestId('activity-sidebar-panel');
    await waitFor(() => expect(panel).toHaveAttribute('aria-hidden', 'false'));
    expect(screen.getByRole('button', { name: /hide activity feed/i })).toBeInTheDocument();
  });

  it('collapses again when the close button is clicked', async () => {
    render(<ActivitySidebar onArchitectClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /show activity feed/i }));
    fireEvent.click(screen.getByRole('button', { name: /hide activity feed/i }));

    const panel = screen.getByTestId('activity-sidebar-panel');
    await waitFor(() => expect(panel).toHaveAttribute('aria-hidden', 'true'));
  });

  it('persists the expanded preference to localStorage', () => {
    render(<ActivitySidebar onArchitectClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /show activity feed/i }));
    expect(window.localStorage.getItem('metacron.live.activitySidebar.expanded')).toBe('true');
  });

  it('hydrates from localStorage when expanded was previously true', () => {
    window.localStorage.setItem('metacron.live.activitySidebar.expanded', 'true');
    render(<ActivitySidebar onArchitectClick={() => {}} />);
    const panel = screen.getByTestId('activity-sidebar-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });
});
