// @vitest-environment jsdom
//
// tests/connectors-ui/disconnect-confirm.test.tsx
//
// Behavioral tests for the disconnect confirmation modal. Confirms the
// click-then-POST flow, the operator-email header propagation, and the
// error-surfacing path when the API rejects.

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { DisconnectConfirm } from '@/components/settings/connectors/DisconnectConfirm';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function installFetchMock(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, init };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

beforeEach(() => {
  window.localStorage.setItem('pf_email', 'kyle@freakngenius.com');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('DisconnectConfirm', () => {
  it('shows the confirmation copy with the connector type', () => {
    installFetchMock(() => jsonResponse({ ok: true }));
    render(
      <DisconnectConfirm
        connectorId="conn-1"
        connectorType="slack"
        onClose={() => undefined}
        onComplete={() => undefined}
      />,
    );
    expect(screen.getByTestId('disconnect-confirm-modal')).toBeInTheDocument();
    expect(screen.getByText(/Slack workspace/)).toBeInTheDocument();
    expect(screen.getByText(/reconnect anytime/i)).toBeInTheDocument();
  });

  it('calls onClose when the cancel button is clicked', () => {
    installFetchMock(() => jsonResponse({ ok: true }));
    const onClose = vi.fn();
    render(
      <DisconnectConfirm
        connectorId="conn-1"
        connectorType="slack"
        onClose={onClose}
        onComplete={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId('disconnect-confirm-cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('POSTs to the disconnect endpoint with the operator email header on confirm', async () => {
    const calls = installFetchMock(() => jsonResponse({ ok: true, provider_revoked: true }));
    const onComplete = vi.fn();
    render(
      <DisconnectConfirm
        connectorId="conn-1"
        connectorType="slack"
        onClose={() => undefined}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByTestId('disconnect-confirm-submit'));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(calls[0].url).toContain('/api/connectors/conn-1/disconnect');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.headers).toMatchObject({
      'x-operator-email': 'kyle@freakngenius.com',
    });
  });

  it('surfaces an inline error when the API returns a non-2xx status', async () => {
    installFetchMock(() => jsonResponse({ error: 'forbidden' }, { status: 403 }));
    const onComplete = vi.fn();
    render(
      <DisconnectConfirm
        connectorId="conn-1"
        connectorType="slack"
        onClose={() => undefined}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByTestId('disconnect-confirm-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('disconnect-confirm-error')).toHaveTextContent(/forbidden/);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('renders the right provider phrase per connector type', () => {
    installFetchMock(() => jsonResponse({ ok: true }));
    const { rerender } = render(
      <DisconnectConfirm
        connectorId="conn-2"
        connectorType="hubspot"
        onClose={() => undefined}
        onComplete={() => undefined}
      />,
    );
    expect(screen.getByText(/HubSpot portal/)).toBeInTheDocument();

    rerender(
      <DisconnectConfirm
        connectorId="conn-3"
        connectorType="teams"
        onClose={() => undefined}
        onComplete={() => undefined}
      />,
    );
    expect(screen.getByText(/Microsoft Teams tenant/)).toBeInTheDocument();
  });
});
