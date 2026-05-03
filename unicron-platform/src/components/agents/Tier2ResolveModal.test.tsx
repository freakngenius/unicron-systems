import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { Tier2ResolveModal } from './Tier2ResolveModal';
import type { InboxTicket } from '../../lib/contracts/inbox';

const ticket: InboxTicket = {
  id: 'ticket-1',
  category: 'source-discovery',
  candidate_url: 'https://example.test/permits',
  reason: 'Free-text feed; needs parser hint.',
  hint: 'rss',
  jurisdiction: 'Pittsburgh, PA',
  status: 'open',
  created_at: new Date().toISOString(),
  payload: null,
  resolved_at: null,
  resolved_by_user_email: null,
  resolution_note: null,
  session_id: null,
  source_id: null,
};

describe('Tier2ResolveModal', () => {
  it('renders the ticket reason + candidate URL on mount', () => {
    render(<Tier2ResolveModal ticket={ticket} onClose={() => {}} resolveFn={vi.fn()} />);
    expect(screen.getByText(ticket.candidate_url!)).toBeInTheDocument();
    expect(screen.getByText(/Free-text feed/)).toBeInTheDocument();
  });

  it('blocks submission when manual mode lacks a note', async () => {
    const resolveFn = vi.fn();
    render(<Tier2ResolveModal ticket={ticket} onClose={() => {}} resolveFn={resolveFn} />);
    fireEvent.click(screen.getByTestId('tier2-mode-manual'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('tier2-submit'));
    });
    expect(screen.getByTestId('tier2-error')).toHaveTextContent(/Note is required/i);
    expect(resolveFn).not.toHaveBeenCalled();
  });

  it('manual mode with note submits resolution=manual + note', async () => {
    const resolveFn = vi.fn().mockResolvedValue({ status: 'resolved' });
    const onResolved = vi.fn();
    render(
      <Tier2ResolveModal
        ticket={ticket}
        onClose={() => {}}
        resolveFn={resolveFn}
        onResolved={onResolved}
      />,
    );
    fireEvent.click(screen.getByTestId('tier2-mode-manual'));
    fireEvent.change(screen.getByTestId('tier2-note'), {
      target: { value: 'pulled the data manually for now' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('tier2-submit'));
    });
    await waitFor(() => expect(resolveFn).toHaveBeenCalledTimes(1));
    expect(resolveFn.mock.calls[0]).toEqual([
      'ticket-1',
      {
        resolution: 'manual',
        resolution_note: 'pulled the data manually for now',
      },
    ]);
    expect(onResolved).toHaveBeenCalled();
    expect(screen.getByTestId('tier2-resolve-success')).toHaveTextContent(/RESOLVED/);
  });

  it('resume mode reveals resume fields and submits with overrides', async () => {
    const resolveFn = vi
      .fn()
      .mockResolvedValue({ status: 'queued', request_id: 'req-1' });
    render(<Tier2ResolveModal ticket={ticket} onClose={() => {}} resolveFn={resolveFn} />);
    fireEvent.click(screen.getByTestId('tier2-mode-resume'));
    fireEvent.change(screen.getByTestId('tier2-resume-url'), {
      target: { value: 'https://example.test/permits.json' },
    });
    fireEvent.change(screen.getByTestId('tier2-resume-api-key-env'), {
      target: { value: 'EXAMPLE_API_TOKEN' },
    });
    fireEvent.change(screen.getByTestId('tier2-resume-hint'), {
      target: { value: 'rest' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('tier2-submit'));
    });
    await waitFor(() => expect(resolveFn).toHaveBeenCalledTimes(1));
    const [, body] = resolveFn.mock.calls[0];
    expect(body).toEqual({
      resolution: 'resume',
      resume_url: 'https://example.test/permits.json',
      resume_api_key_env: 'EXAMPLE_API_TOKEN',
      resume_hint: 'rest',
      resume_jurisdiction: 'Pittsburgh, PA',
    });
  });

  it('dismiss mode + note submits resolution=dismiss', async () => {
    const resolveFn = vi.fn().mockResolvedValue({ status: 'dismissed' });
    render(<Tier2ResolveModal ticket={ticket} onClose={() => {}} resolveFn={resolveFn} />);
    fireEvent.click(screen.getByTestId('tier2-mode-dismiss'));
    fireEvent.change(screen.getByTestId('tier2-note'), {
      target: { value: 'low signal source — not worth resolving' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('tier2-submit'));
    });
    await waitFor(() => expect(resolveFn).toHaveBeenCalledTimes(1));
    expect(resolveFn.mock.calls[0][1]).toEqual({
      resolution: 'dismiss',
      resolution_note: 'low signal source — not worth resolving',
    });
  });
});
