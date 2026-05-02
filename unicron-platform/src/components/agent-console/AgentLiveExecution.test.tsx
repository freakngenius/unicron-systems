import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AgentLiveExecution } from './AgentLiveExecution';
import type { AgentDispatchEvent } from '../../lib/contracts/agentConsole';

const DISPATCH_ID = '11111111-1111-1111-1111-111111111111';

function makeEvent(overrides: Partial<AgentDispatchEvent> = {}): AgentDispatchEvent {
  return {
    id: crypto.randomUUID(),
    dispatch_id: DISPATCH_ID,
    event_type: 'reasoning',
    payload: { text: 'thinking…' },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('AgentLiveExecution', () => {
  it('renders the loading state and then the empty state when no events arrive', async () => {
    const subscribe = vi.fn(() => () => {});
    const loadInitial = vi.fn().mockResolvedValue([]);

    render(
      <AgentLiveExecution
        dispatchId={DISPATCH_ID}
        subscribeFn={subscribe}
        loadInitial={loadInitial}
      />,
    );

    expect(screen.getByText(/LOADING/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/NO EVENTS YET/)).toBeInTheDocument());
    expect(loadInitial).toHaveBeenCalledWith(DISPATCH_ID);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('renders streamed events in the order they arrive (contract-mock realtime smoke)', async () => {
    let onEvent: ((e: AgentDispatchEvent) => void) | null = null;
    const subscribe = vi.fn((_id: string, handler: (e: AgentDispatchEvent) => void) => {
      onEvent = handler;
      return () => {};
    });
    const loadInitial = vi.fn().mockResolvedValue([]);

    render(
      <AgentLiveExecution
        dispatchId={DISPATCH_ID}
        subscribeFn={subscribe}
        loadInitial={loadInitial}
      />,
    );

    await waitFor(() => expect(screen.getByText(/NO EVENTS YET/)).toBeInTheDocument());

    const e1 = makeEvent({ event_type: 'reasoning', payload: { text: 'investigating' } });
    const e2 = makeEvent({ event_type: 'tool_call', payload: { name: 'fetch' } });
    act(() => {
      onEvent?.(e1);
      onEvent?.(e2);
    });

    const tiles = await screen.findAllByTestId('agent-live-execution-event');
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAttribute('data-event-type', 'reasoning');
    expect(tiles[1]).toHaveAttribute('data-event-type', 'tool_call');
  });

  it('respects eventTypeFilter and ignores out-of-filter events', async () => {
    let onEvent: ((e: AgentDispatchEvent) => void) | null = null;
    const subscribe = vi.fn((_id: string, handler: (e: AgentDispatchEvent) => void) => {
      onEvent = handler;
      return () => {};
    });
    const loadInitial = vi.fn().mockResolvedValue([]);

    render(
      <AgentLiveExecution
        dispatchId={DISPATCH_ID}
        subscribeFn={subscribe}
        loadInitial={loadInitial}
        eventTypeFilter={['decision', 'error']}
      />,
    );

    await waitFor(() => expect(screen.getByText(/NO EVENTS YET/)).toBeInTheDocument());

    act(() => {
      onEvent?.(makeEvent({ event_type: 'reasoning' }));
      onEvent?.(makeEvent({ event_type: 'decision' }));
      onEvent?.(makeEvent({ event_type: 'tool_call' }));
    });

    const tiles = await screen.findAllByTestId('agent-live-execution-event');
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toHaveAttribute('data-event-type', 'decision');
  });

  it('deduplicates events with the same id', async () => {
    let onEvent: ((e: AgentDispatchEvent) => void) | null = null;
    const subscribe = vi.fn((_id: string, handler: (e: AgentDispatchEvent) => void) => {
      onEvent = handler;
      return () => {};
    });
    const loadInitial = vi.fn().mockResolvedValue([]);

    render(
      <AgentLiveExecution
        dispatchId={DISPATCH_ID}
        subscribeFn={subscribe}
        loadInitial={loadInitial}
      />,
    );

    await waitFor(() => expect(screen.getByText(/NO EVENTS YET/)).toBeInTheDocument());

    const same = makeEvent();
    act(() => {
      onEvent?.(same);
      onEvent?.(same);
    });

    const tiles = await screen.findAllByTestId('agent-live-execution-event');
    expect(tiles).toHaveLength(1);
  });

  it('unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const loadInitial = vi.fn().mockResolvedValue([]);

    const { unmount } = render(
      <AgentLiveExecution
        dispatchId={DISPATCH_ID}
        subscribeFn={subscribe}
        loadInitial={loadInitial}
      />,
    );
    await waitFor(() => expect(screen.getByText(/NO EVENTS YET/)).toBeInTheDocument());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
