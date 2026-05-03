// @vitest-environment jsdom
//
// Component tests for BriefingPrefsForm — render + state transitions
// + button wiring. Network calls are stubbed via vi.spyOn(window, 'fetch').

import * as React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { BriefingPrefsForm } from '@/components/settings/BriefingPrefsForm';
import { DEFAULT_BRIEFING_PREFS } from '@/lib/types';

function setOperatorEmail(email: string | null) {
  if (typeof window === 'undefined') return;
  if (email === null) {
    window.localStorage.removeItem('pf_email');
  } else {
    window.localStorage.setItem('pf_email', email);
  }
}

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('BriefingPrefsForm', () => {
  beforeEach(() => {
    setOperatorEmail(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setOperatorEmail(null);
    cleanup();
  });

  it('shows the no-operator-email message when localStorage is empty', () => {
    render(<BriefingPrefsForm />);
    expect(
      screen.getByText(/No operator email found/),
    ).toBeInTheDocument();
  });

  it('loads prefs and renders form with the loaded values', async () => {
    setOperatorEmail('kyle@freakngenius.com');
    mockFetch(async () =>
      jsonResponse({
        prefs: {
          user_id: 'kyle@freakngenius.com',
          frequency: 'weekly',
          send_hour: 8,
          timezone: 'America/New_York',
          sections: {
            new_leads: true,
            follow_ups: false,
            stage_changes: true,
            replies: true,
            contacts_pending: false,
          },
          paused: true,
          created_at: '',
          updated_at: '',
        },
      }),
    );
    render(<BriefingPrefsForm />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('weekly')).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue('8')).toBeInTheDocument();
    expect(screen.getByDisplayValue('America/New_York')).toBeInTheDocument();
    // Paused checkbox checked.
    const pausedCheckbox = screen.getByLabelText(/Pause briefs/);
    expect((pausedCheckbox as HTMLInputElement).checked).toBe(true);
    // Follow-ups + contacts_pending unchecked from the loaded prefs.
    const followUps = screen.getByLabelText('Follow-ups due');
    expect((followUps as HTMLInputElement).checked).toBe(false);
  });

  it('falls back to defaults when /prefs returns nothing meaningful', async () => {
    setOperatorEmail('kyle@freakngenius.com');
    mockFetch(async () => jsonResponse({}));
    render(<BriefingPrefsForm />);
    await waitFor(() =>
      expect(screen.getByDisplayValue(DEFAULT_BRIEFING_PREFS.frequency)).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue(String(DEFAULT_BRIEFING_PREFS.send_hour))).toBeInTheDocument();
  });

  it('POSTs the form state when Save is clicked', async () => {
    setOperatorEmail('kyle@freakngenius.com');
    const fetchSpy = mockFetch(async (input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse({
          prefs: {
            user_id: 'kyle@freakngenius.com',
            ...DEFAULT_BRIEFING_PREFS,
            created_at: '',
            updated_at: '',
          },
        });
      }
      return jsonResponse({
        prefs: {
          user_id: 'kyle@freakngenius.com',
          ...DEFAULT_BRIEFING_PREFS,
          created_at: '',
          updated_at: '',
        },
      });
    });

    render(<BriefingPrefsForm />);
    await waitFor(() =>
      expect(screen.getByText('Save preferences')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Save preferences'));
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
    const calls = fetchSpy.mock.calls;
    const post = calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeDefined();
    expect(post?.[0]).toBe('/pathfinder/api/briefing/prefs');
  });

  it('renders the preview panel when Preview returns a brief', async () => {
    setOperatorEmail('kyle@freakngenius.com');
    mockFetch(async (input) => {
      const url = String(input);
      if (url.includes('/preview')) {
        return jsonResponse({
          brief: {
            subject: 'Pathfinder daily brief — 2026-05-04 — quiet day',
            markdown: '# Brief\n\n## Top new leads\n\n_None._',
            html: '<h1>Brief</h1>',
            metrics: {
              new_leads_count: 0,
              follow_ups_count: 0,
              stage_changes_count: 0,
              replies_count: 0,
              contacts_pending_count: 0,
              llm_cost_usd: 0,
            },
            sections_rendered: [],
          },
        });
      }
      return jsonResponse({});
    });

    render(<BriefingPrefsForm />);
    await waitFor(() => expect(screen.getByText('Preview')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Preview'));
    await waitFor(() =>
      expect(screen.getByText(/Pathfinder daily brief — 2026-05-04 — quiet day/)).toBeInTheDocument(),
    );
    // The preview <pre> contains the rendered markdown.
    expect(screen.getByText(/## Top new leads/)).toBeInTheDocument();
  });

  it('shows an error when dispatch returns no_active_integration', async () => {
    setOperatorEmail('kyle@freakngenius.com');
    mockFetch(async (input, init) => {
      const url = String(input);
      if (url.includes('/dispatch') && init?.method === 'POST') {
        return jsonResponse(
          { ok: false, error: 'no_active_integration' },
          412,
        );
      }
      return jsonResponse({});
    });

    render(<BriefingPrefsForm />);
    await waitFor(() => expect(screen.getByText('Send me one now')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Send me one now'));
    await waitFor(() =>
      expect(screen.getByText(/Connect Gmail or Outlook/i)).toBeInTheDocument(),
    );
  });
});
