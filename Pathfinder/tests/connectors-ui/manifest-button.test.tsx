// @vitest-environment jsdom
//
// tests/connectors-ui/manifest-button.test.tsx
//
// Behavioural tests for the C-2B "Generate manifest for IT" button on the
// Connectors settings tile. The button only renders on disconnected
// Slack/Teams tiles; clicking it issues a fetch to the operator-gated
// manifest endpoint and triggers a browser download.

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ConnectorsView, type ConnectorsViewTile } from '@/components/settings/connectors/ConnectorsView';

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

function blobResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

function tileFor(id: 'slack' | 'teams' | 'hubspot', state: 'disconnected' | 'connected'): ConnectorsViewTile {
  return {
    id,
    name: id === 'slack' ? 'Slack' : id === 'teams' ? 'Microsoft Teams' : 'HubSpot CRM',
    oneLiner: 'Test tile',
    state,
    authStartHref: state === 'disconnected' ? `/api/connectors/${id}/auth` : undefined,
    connectorId: state === 'connected' ? `conn-${id}` : undefined,
  };
}

beforeEach(() => {
  window.localStorage.setItem('pf_email', 'kyle@freakngenius.com');
  // jsdom's URL.createObjectURL is unimplemented by default. Cast to
  // a relaxed shape so vi.fn typings line up with lib.dom's signature.
  (window.URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
    () => 'blob:mock-url',
  );
  (window.URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('ConnectorsView manifest button', () => {
  it('renders the manifest button on disconnected slack and teams tiles', () => {
    installFetchMock(() => blobResponse('', 'application/x-yaml'));
    const tiles = [
      tileFor('slack', 'disconnected'),
      tileFor('teams', 'disconnected'),
      tileFor('hubspot', 'disconnected'),
    ];
    render(<ConnectorsView tiles={tiles} orgId="zedcor" />);
    expect(screen.getByTestId('connector-tile-slack-manifest')).toBeInTheDocument();
    expect(screen.getByTestId('connector-tile-teams-manifest')).toBeInTheDocument();
    expect(screen.queryByTestId('connector-tile-hubspot-manifest')).toBeNull();
  });

  it('does NOT render the manifest button when slack is already connected', () => {
    installFetchMock(() => blobResponse('', 'application/x-yaml'));
    const tiles = [tileFor('slack', 'connected')];
    render(<ConnectorsView tiles={tiles} orgId="zedcor" />);
    expect(screen.queryByTestId('connector-tile-slack-manifest')).toBeNull();
  });

  it('fetches the slack manifest with the operator email header on click', async () => {
    const calls = installFetchMock(() =>
      blobResponse('display_information:\n  name: Pathfinder (zedcor)\n', 'application/x-yaml'),
    );
    const tiles = [tileFor('slack', 'disconnected')];
    render(<ConnectorsView tiles={tiles} orgId="zedcor" />);
    fireEvent.click(screen.getByTestId('connector-tile-slack-manifest'));
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0].url).toBe('/api/connectors/slack/manifest?org_id=zedcor');
    expect(calls[0].init?.headers).toMatchObject({
      'x-operator-email': 'kyle@freakngenius.com',
    });
  });

  it('triggers a blob download via createObjectURL on success', async () => {
    installFetchMock(() => blobResponse('zip-bytes', 'application/zip'));
    const tiles = [tileFor('teams', 'disconnected')];
    render(<ConnectorsView tiles={tiles} orgId="zedcor" />);
    fireEvent.click(screen.getByTestId('connector-tile-teams-manifest'));
    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('alerts the operator when the manifest endpoint returns a non-2xx', async () => {
    installFetchMock(() => new Response('forbidden', { status: 403 }));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const tiles = [tileFor('slack', 'disconnected')];
    render(<ConnectorsView tiles={tiles} orgId="zedcor" />);
    fireEvent.click(screen.getByTestId('connector-tile-slack-manifest'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0][0]).toContain('403');
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });
});
