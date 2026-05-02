// @vitest-environment jsdom
//
// tests/connectors-ui/routing-rules-modal.test.tsx
//
// Behavioral tests for the routing-rules editor modal. The modal owns
// the full add/test/delete loop for connector_routing_rules. We mock
// fetch so the suite stays hermetic — the API contract is covered by
// the validate test + the route handlers themselves.

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { RoutingRulesModal } from '@/components/settings/connectors/RoutingRulesModal';
import type { ConnectorRoutingRule } from '@/lib/types';

const SAMPLE_RULES: ConnectorRoutingRule[] = [
  {
    id: 'rule-1',
    connector_id: 'conn-1',
    event_type: 'lead.high_score',
    channel_id: '#hot-leads',
    channel_name: 'Hot Leads',
    filter_json: { min_score: 90 },
    quiet_hours_json: null,
    is_active: true,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  },
  {
    id: 'rule-2',
    connector_id: 'conn-1',
    event_type: 'cost.alert',
    channel_id: '#pathfinder-ops',
    channel_name: null,
    filter_json: {},
    quiet_hours_json: null,
    is_active: true,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  },
];

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
  // localStorage seeded so the modal sends an x-operator-email header.
  window.localStorage.setItem('pf_email', 'kyle@freakngenius.com');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('RoutingRulesModal', () => {
  it('renders the existing rules returned by the API', async () => {
    installFetchMock(({ url }) => {
      if (url.endsWith('/rules')) return jsonResponse({ rules: SAMPLE_RULES });
      return jsonResponse({ channels: [] });
    });

    render(
      <RoutingRulesModal connectorId="conn-1" connectorType="slack" onClose={() => undefined} />,
    );

    expect(await screen.findByTestId('routing-rule-rule-1')).toBeInTheDocument();
    expect(screen.getByTestId('routing-rule-rule-2')).toBeInTheDocument();
    expect(screen.getByTestId('routing-rule-rule-1')).toHaveTextContent('lead.high_score');
    expect(screen.getByTestId('routing-rule-rule-1')).toHaveTextContent('#hot-leads');
  });

  it('shows the empty-state message when no rules exist', async () => {
    installFetchMock(({ url }) => {
      if (url.endsWith('/rules')) return jsonResponse({ rules: [] });
      return jsonResponse({ channels: [] });
    });

    render(
      <RoutingRulesModal connectorId="conn-1" connectorType="slack" onClose={() => undefined} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/no active rules/i)).toBeInTheDocument();
    });
  });

  it('surfaces validation errors when the add form is submitted with bad input', async () => {
    installFetchMock(({ url }) => {
      if (url.endsWith('/rules')) return jsonResponse({ rules: [] });
      return jsonResponse({ channels: [] });
    });

    render(
      <RoutingRulesModal connectorId="conn-1" connectorType="slack" onClose={() => undefined} />,
    );

    await waitFor(() => screen.getByTestId('routing-rules-add-form'));

    // Submit with empty fields → both event_type and channel_id should error.
    fireEvent.submit(screen.getByTestId('routing-rules-add-form'));
    expect(await screen.findByTestId('routing-rules-errors')).toHaveTextContent(/event_type/);
    expect(screen.getByTestId('routing-rules-errors')).toHaveTextContent(/channel_id/);
  });

  it('surfaces filter_json parse errors in the modal', async () => {
    installFetchMock(({ url }) => {
      if (url.endsWith('/rules')) return jsonResponse({ rules: [] });
      return jsonResponse({ channels: [] });
    });

    render(
      <RoutingRulesModal connectorId="conn-1" connectorType="slack" onClose={() => undefined} />,
    );

    await waitFor(() => screen.getByTestId('routing-rules-add-form'));

    fireEvent.change(screen.getByTestId('routing-rule-event-type'), {
      target: { value: 'lead.high_score' },
    });
    fireEvent.change(screen.getByTestId('routing-rule-channel-input'), {
      target: { value: '#alerts' },
    });
    fireEvent.change(screen.getByTestId('routing-rule-filter-json'), {
      target: { value: '{not-json}' },
    });
    fireEvent.submit(screen.getByTestId('routing-rules-add-form'));

    expect(await screen.findByTestId('routing-rules-errors')).toHaveTextContent(/filter_json/);
  });

  it('POSTs the new rule on a valid submit and forwards the operator header', async () => {
    const calls = installFetchMock(({ url, init }) => {
      if (url.endsWith('/rules') && (!init || init.method === undefined || init.method === 'GET')) {
        return jsonResponse({ rules: [] });
      }
      if (url.endsWith('/rules') && init?.method === 'POST') {
        return jsonResponse(
          {
            rule: {
              ...SAMPLE_RULES[0],
              id: 'rule-new',
              event_type: 'lead.high_score',
              channel_id: '#alerts',
            },
          },
          { status: 201 },
        );
      }
      return jsonResponse({ channels: [] });
    });

    render(
      <RoutingRulesModal connectorId="conn-1" connectorType="slack" onClose={() => undefined} />,
    );

    await waitFor(() => screen.getByTestId('routing-rules-add-form'));

    fireEvent.change(screen.getByTestId('routing-rule-event-type'), {
      target: { value: 'lead.high_score' },
    });
    fireEvent.change(screen.getByTestId('routing-rule-channel-input'), {
      target: { value: '#alerts' },
    });
    fireEvent.submit(screen.getByTestId('routing-rules-add-form'));

    await waitFor(() => {
      expect(screen.getByTestId('routing-rule-rule-new')).toBeInTheDocument();
    });

    const post = calls.find((c) => c.init?.method === 'POST');
    expect(post).toBeDefined();
    expect(post?.init?.headers).toMatchObject({
      'x-operator-email': 'kyle@freakngenius.com',
    });
    const body = JSON.parse(post?.init?.body as string) as Record<string, unknown>;
    expect(body.event_type).toBe('lead.high_score');
    expect(body.channel_id).toBe('#alerts');
  });

  it('uses the channel autocomplete when C-1B exposes the list endpoint', async () => {
    installFetchMock(({ url }) => {
      if (url.endsWith('/rules')) return jsonResponse({ rules: [] });
      if (url.includes('/connectors/slack/channels/list')) {
        return jsonResponse({ channels: [{ id: 'C123', name: 'hot-leads' }] });
      }
      return jsonResponse({});
    });

    render(
      <RoutingRulesModal connectorId="conn-1" connectorType="slack" onClose={() => undefined} />,
    );

    await waitFor(() => {
      // Once channels load, the dropdown replaces the text input.
      expect(screen.getByTestId('routing-rule-channel-select')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('routing-rule-channel-input')).toBeNull();
  });

  it('falls back to the text input + hint when channels:read is unavailable', async () => {
    installFetchMock(({ url }) => {
      if (url.endsWith('/rules')) return jsonResponse({ rules: [] });
      // Simulate 404 on the channel-list endpoint
      return new Response('not found', { status: 404 });
    });

    render(
      <RoutingRulesModal connectorId="conn-1" connectorType="slack" onClose={() => undefined} />,
    );

    await waitFor(() => screen.getByTestId('routing-rules-add-form'));
    expect(screen.getByTestId('routing-rule-channel-input')).toBeInTheDocument();
    expect(screen.getByText(/channels:read scope/i)).toBeInTheDocument();
  });

  it('fires the test endpoint when the Test button is clicked', async () => {
    const calls = installFetchMock(({ url, init }) => {
      if (url.endsWith('/rules') && (!init || init.method === 'GET' || !init.method))
        return jsonResponse({ rules: SAMPLE_RULES });
      if (url.endsWith('/test')) {
        return jsonResponse({ dispatched: true });
      }
      return jsonResponse({});
    });

    render(
      <RoutingRulesModal connectorId="conn-1" connectorType="slack" onClose={() => undefined} />,
    );

    await waitFor(() => screen.getByTestId('routing-rule-rule-1-test'));
    fireEvent.click(screen.getByTestId('routing-rule-rule-1-test'));

    await waitFor(() => {
      expect(screen.getByTestId('routing-rule-test-result')).toHaveTextContent(/Dispatched/);
    });

    const testCall = calls.find((c) => c.url.endsWith('/test'));
    expect(testCall).toBeDefined();
    expect(testCall?.init?.method).toBe('POST');
  });
});
