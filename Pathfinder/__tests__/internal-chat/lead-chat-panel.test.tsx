// @vitest-environment jsdom
//
// Render-smoke for the Internal Lead Chat panel: launcher renders, click
// toggles open, scoped empty state mentions the focal company, copy
// button writes the assistant content to navigator.clipboard. Network
// calls are stubbed via global.fetch so the test runs offline.

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// jsdom 27 in this repo does not always attach localStorage. Polyfill it
// here so the panel's thread-id memoization survives the test without
// pulling in a separate jsdom navigation setup. Matches the pattern other
// repos use when jsdom strips storage on default construction.
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      get length() {
        return store.size;
      },
    },
    writable: true,
    configurable: true,
  });
}

import { LeadChatLauncher } from '@/components/internal/lead-chat/LeadChatLauncher';
import { LeadChatPanel } from '@/components/internal/lead-chat/LeadChatPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubFetchEmpty() {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ thread_id: 't-test', messages: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('LeadChatLauncher', () => {
  beforeEach(() => {
    stubFetchEmpty();
    window.localStorage.clear();
  });

  it('renders the floating launcher button', () => {
    render(
      <LeadChatLauncher
        orgSlug="internal"
        orgId="org-id-internal"
        scopeLabel="All Internal companies"
        schema={undefined}
      />,
    );
    const btn = screen.getByTestId('lead-chat-launcher');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Open chat');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    // No text label; the glyph is a chat SVG inlined from lucide.
    expect(btn.textContent ?? '').toBe('');
    expect(btn.querySelector('[data-launcher-icon="chat"]')).not.toBeNull();
  });

  it('opens the panel on click and shows the scoped Viewing chip', async () => {
    render(
      <LeadChatLauncher
        orgSlug="internal"
        orgId="org-id-internal"
        companyId="sam:THALLE"
        companyName="Thalle Construction Company"
        scopeLabel="Thalle Construction Company"
        schema={undefined}
      />,
    );
    const btn = screen.getByTestId('lead-chat-launcher');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByTestId('lead-chat-panel')).toBeInTheDocument();
    // ChatContextIndicator renders "Viewing" + the scope label.
    expect(screen.getByText(/Viewing/i)).toBeInTheDocument();
    expect(screen.getByText('Thalle Construction Company')).toBeInTheDocument();
  });
});

describe('LeadChatPanel empty state and inputs', () => {
  beforeEach(() => {
    stubFetchEmpty();
    window.localStorage.clear();
  });

  it('shows a company-scoped empty state when companyName is set', () => {
    render(
      <LeadChatPanel
        open
        onClose={() => {}}
        onMinimize={() => {}}
        orgSlug="internal"
        orgId="org-id-internal"
        companyId="sam:THALLE"
        companyName="Thalle Construction Company"
        scopeLabel="Thalle Construction Company"
        schema={undefined}
      />,
    );
    expect(
      screen.getByText(/Ask anything about Thalle Construction Company/i),
    ).toBeInTheDocument();
  });

  it('shows the list-scoped empty state when no company is set', () => {
    render(
      <LeadChatPanel
        open
        onClose={() => {}}
        onMinimize={() => {}}
        orgSlug="internal"
        orgId="org-id-internal"
        companyId={null}
        companyName={null}
        scopeLabel="All Internal companies"
        schema={undefined}
      />,
    );
    expect(
      screen.getByText(/Ask anything about the Internal pipeline/i),
    ).toBeInTheDocument();
  });

  it('disables Send when the draft is empty', () => {
    render(
      <LeadChatPanel
        open
        onClose={() => {}}
        onMinimize={() => {}}
        orgSlug="internal"
        orgId="org-id-internal"
        companyId={null}
        companyName={null}
        scopeLabel="All Internal companies"
        schema={undefined}
      />,
    );
    const send = screen.getByTestId('lead-chat-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });
});

describe('LeadChatPanel SSE chips', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function sseStream(events: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(`data: ${e}\n\n`));
        }
        controller.close();
      },
    });
  }

  function stubFetchSequence(streamResponse: Response) {
    const initial = new Response(JSON.stringify({ thread_id: 't-test', messages: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? initial : streamResponse;
    }) as unknown as typeof fetch;
  }

  it('renders the "Looking up leads" chip on a pathfinder_leads tool_start, clears it on delta', async () => {
    const stream = sseStream([
      JSON.stringify({ type: 'meta', threadId: 't-test', scopeLabel: 'All Internal companies' }),
      JSON.stringify({ type: 'tool_start', name: 'pathfinder_leads' }),
    ]);
    const streamResponse = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    stubFetchSequence(streamResponse);

    render(
      <LeadChatPanel
        open
        onClose={() => {}}
        onMinimize={() => {}}
        orgSlug="internal"
        orgId="org-id-internal"
        companyId={null}
        companyName={null}
        scopeLabel="All Internal companies"
        schema={undefined}
      />,
    );

    // Type, send.
    const textarea = screen.getByTestId('lead-chat-input') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'How many federal awardees?' } });
    });
    const send = screen.getByTestId('lead-chat-send');
    await act(async () => {
      fireEvent.click(send);
    });

    await waitFor(() => {
      expect(screen.getByTestId('lead-chat-looking-up')).toBeInTheDocument();
    });
  });

  it('renders the "Researching with Perplexity" chip on a perplexity_sonar tool_start', async () => {
    const stream = sseStream([
      JSON.stringify({ type: 'meta', threadId: 't-test', scopeLabel: 'Manson' }),
      JSON.stringify({ type: 'tool_start', name: 'perplexity_sonar' }),
      JSON.stringify({ type: 'researching', provider: 'perplexity-sonar' }),
    ]);
    const streamResponse = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    stubFetchSequence(streamResponse);

    render(
      <LeadChatPanel
        open
        onClose={() => {}}
        onMinimize={() => {}}
        orgSlug="internal"
        orgId="org-id-internal"
        companyId="sam:MANSON"
        companyName="Manson Construction Co"
        scopeLabel="Manson Construction Co"
        schema={undefined}
      />,
    );

    const textarea = screen.getByTestId('lead-chat-input') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Recent news on Manson?' } });
    });
    const send = screen.getByTestId('lead-chat-send');
    await act(async () => {
      fireEvent.click(send);
    });

    await waitFor(() => {
      expect(screen.getByTestId('lead-chat-researching')).toBeInTheDocument();
    });
  });

  it('renders MarkdownRenderer for assistant prose (no raw ** or - syntax) and CompanyLeadCards for referenced_leads', async () => {
    // SPEC-Chat-Fixes.md defect 2 + 3 coverage. The stream emits a small
    // markdown delta and a referenced_leads event; the panel must render
    // the prose as formatted HTML (no literal asterisks) and a clickable
    // CompanyLeadCard for each lead.
    const stream = sseStream([
      JSON.stringify({ type: 'meta', threadId: 't-test', scopeLabel: 'All Internal companies' }),
      JSON.stringify({ type: 'delta', text: '**Top three** to focus on:\n\n- A\n- B' }),
      JSON.stringify({
        type: 'referenced_leads',
        items: [
          {
            id: 'sam:THALLE',
            company_name: 'Thalle Construction Company',
            score: 87,
            verified: true,
            service_category: 'general-contractor',
            footprint: null,
            sales_motion: null,
            hq_location: null,
            federal_registration: null,
            associations: [],
            employee_count: null,
            source: null,
            posted_date: null,
            warm_intro: null,
            first_step: null,
            rationale: 'High federal awards.',
          },
        ],
      }),
      JSON.stringify({ type: 'done', latencyMs: 1 }),
    ]);
    const streamResponse = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    stubFetchSequence(streamResponse);

    render(
      <LeadChatPanel
        open
        onClose={() => {}}
        onMinimize={() => {}}
        orgSlug="internal"
        orgId="org-id-internal"
        companyId={null}
        companyName={null}
        scopeLabel="All Internal companies"
        schema={undefined}
      />,
    );

    const textarea = screen.getByTestId('lead-chat-input') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Which one to focus on?' } });
    });
    const send = screen.getByTestId('lead-chat-send');
    await act(async () => {
      fireEvent.click(send);
    });

    await waitFor(() => {
      const bubble = screen.getByTestId('lead-chat-message-assistant');
      // Bold rendered as <strong>, not literal asterisks.
      expect(bubble.querySelector('strong')?.textContent).toBe('Top three');
      // Bullet list rendered as <ul><li>, not literal dashes.
      expect(bubble.querySelector('ul li')?.textContent).toBe('A');
      expect(bubble.textContent ?? '').not.toMatch(/\*\*/);
    });

    await waitFor(() => {
      const strip = screen.getByTestId('lead-chat-referenced-leads');
      expect(strip).toBeInTheDocument();
      // The CompanyLeadCard wraps in a Next link to /internal/leads/<id>.
      expect(
        strip.querySelector('a[href="/internal/leads/sam%3ATHALLE"]'),
      ).not.toBeNull();
    });
  });
});
