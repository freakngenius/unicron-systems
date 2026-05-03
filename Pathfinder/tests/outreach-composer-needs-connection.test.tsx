// @vitest-environment jsdom
//
// tests/outreach-composer-needs-connection.test.tsx — Demo Polish UX Gate 11B.
//
// Verifies the OutreachComposer's no_active_integration / no_connection
// surfacing: when Send hits that error path the friendly card appears
// and clicking "Activate Integration" opens the modal.

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { OutreachComposer } from '@/components/lead/OutreachComposer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderComposer(
  overrides: Partial<React.ComponentProps<typeof OutreachComposer>> = {},
) {
  return render(
    <OutreachComposer
      projectId="sam.gov:p1"
      initialDraft={{ to: 'jane@txdot.gov', subject: 'S', body: 'B' }}
      seedNonce={0}
      fromDisplay="kyle@freakngenius.com via Gmail"
      isConnected={true}
      actorEmail="kyle@freakngenius.com"
      {...overrides}
    />,
  );
}

describe('OutreachComposer — no_active_integration handling', () => {
  it('surfaces the Activate Integration card when Send returns code=no_connection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'no_connection', code: 'no_connection' }), {
        status: 412,
        headers: { 'content-type': 'application/json' },
      }) as unknown as Response,
    );
    renderComposer();
    fireEvent.click(screen.getByTestId('outreach-composer-send'));
    await waitFor(() => {
      expect(screen.getByTestId('outreach-composer-needs-connection')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('outreach-composer-activate-integration'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Connect your email to send from Pathfinder/i),
    ).toBeInTheDocument();
    // The bare error feedback alert should NOT appear in the no_connection path.
    expect(screen.queryByTestId('outreach-composer-feedback')).toBeNull();
  });

  it('surfaces the card when error message is no_active_integration (legacy code)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'no_active_integration' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }) as unknown as Response,
    );
    renderComposer();
    fireEvent.click(screen.getByTestId('outreach-composer-send'));
    await waitFor(() => {
      expect(screen.getByTestId('outreach-composer-needs-connection')).toBeInTheDocument();
    });
  });

  it('clicking Activate Integration opens the modal with Gmail + Outlook tiles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'no_connection', code: 'no_connection' }), {
        status: 412,
        headers: { 'content-type': 'application/json' },
      }) as unknown as Response,
    );
    renderComposer();
    fireEvent.click(screen.getByTestId('outreach-composer-send'));
    await waitFor(() => {
      expect(screen.getByTestId('outreach-composer-needs-connection')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('outreach-composer-activate-integration'));
    expect(screen.getByTestId('activate-integration-modal-root')).toBeInTheDocument();
    expect(screen.getByTestId('activate-integration-tile-gmail')).toBeInTheDocument();
    expect(screen.getByTestId('activate-integration-tile-outlook')).toBeInTheDocument();
  });

  it('does NOT surface the card when Send succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, message_id: 'm1', provider: 'gmail' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }) as unknown as Response,
    );
    renderComposer();
    fireEvent.click(screen.getByTestId('outreach-composer-send'));
    await waitFor(() => {
      expect(screen.getByTestId('outreach-composer-feedback')).toHaveAttribute(
        'data-kind',
        'ok',
      );
    });
    expect(screen.queryByTestId('outreach-composer-needs-connection')).toBeNull();
  });

  it('does NOT surface the card when Send fails with a non-connection error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate_limited', code: 'rate_limited' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }) as unknown as Response,
    );
    renderComposer();
    fireEvent.click(screen.getByTestId('outreach-composer-send'));
    await waitFor(() => {
      expect(screen.getByTestId('outreach-composer-feedback')).toHaveTextContent(
        /rate_limited/,
      );
    });
    expect(screen.queryByTestId('outreach-composer-needs-connection')).toBeNull();
  });
});
