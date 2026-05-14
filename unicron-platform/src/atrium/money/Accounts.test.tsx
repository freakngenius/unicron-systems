// Accounts.tsx — UI component test.
// Mounts the Accounts component with a mocked /api/atrium/accounts response
// and verifies the SPEC acceptance criteria:
//  - Paid section above Free section, with subtotal
//  - Credentials NEVER rendered
//  - status pills, category chips, deep-link, currency/date formatting

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Accounts } from './Accounts';

const ORIGINAL_FETCH = global.fetch;
afterEach(() => { global.fetch = ORIGINAL_FETCH; vi.restoreAllMocks(); });

function mockOk(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as typeof fetch;
}

const NOTION_VIEW_URL = 'https://www.notion.so/futuroso/350785c67e728039b4eee158a72bf35c?v=350785c67e72801c9b90000cbc1186e7';

const sampleResponse = {
  notion_url: NOTION_VIEW_URL,
  paid: [
    {
      notion_page_id: 'a1',
      notion_url: 'https://www.notion.so/a1',
      service: 'Vercel',
      status: 'Active',
      category: ['Infrastructure'],
      subscription_usd: 240,
      account_type: 'Yearly',
      last_billed: '2026-04-01',
      start_date: '2025-01-01',
      notes: 'Pro plan',
    },
    {
      notion_page_id: 'a2',
      notion_url: 'https://www.notion.so/a2',
      service: 'OpenAI',
      status: 'Active',
      category: ['AI'],
      subscription_usd: 200,
      account_type: 'Monthly',
      last_billed: '2026-05-01',
      start_date: '2025-06-01',
      notes: null,
    },
  ],
  free: [
    {
      notion_page_id: 'b1',
      notion_url: 'https://www.notion.so/b1',
      service: 'GitHub',
      status: 'Active',
      category: ['Infrastructure'],
      subscription_usd: null,
      account_type: 'Free',
      last_billed: null,
      start_date: '2024-01-01',
      notes: 'Free tier',
    },
  ],
  paid_total_usd: 440,
  paid_monthly_equivalent_usd: 220,
  fetched_at: '2026-05-13T20:00:00.000Z',
};

describe('Accounts (UI)', () => {
  it('renders paid section above free, with subtotal and grouping', async () => {
    mockOk(sampleResponse);
    render(<Accounts />);
    await waitFor(() => expect(screen.getByText('Paid accounts')).toBeInTheDocument());

    expect(screen.getByText('Free / Trial accounts')).toBeInTheDocument();
    // subtotal — $220 is monthly equivalent (240/12 + 200)
    expect(screen.getByText('$220')).toBeInTheDocument();
    // raw total
    expect(screen.getByText('$440')).toBeInTheDocument();
    // services rendered
    expect(screen.getByText('Vercel')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('renders "Open in Notion →" deep-link to the Accounts view URL', async () => {
    mockOk(sampleResponse);
    render(<Accounts />);
    const link = await screen.findByRole('link', { name: /Open in Notion/i });
    expect(link).toHaveAttribute('href', NOTION_VIEW_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('never renders credentials (API / Email / PW / Username)', async () => {
    // Even if a buggy server somehow returned credentials, the UI shouldn't
    // render them — we don't access those fields. Confirm by adding stray
    // credential keys to the payload and asserting they do not appear in DOM.
    const dirtyPayload = {
      ...sampleResponse,
      paid: [{
        ...sampleResponse.paid[0],
        // @ts-expect-error — intentional extra fields that must NOT render
        api: 'lin_api_supersecret_xxxxx',
        email: 'kyle@example.com',
        pw: 'hunter2',
        username: 'kekas',
      }, ...sampleResponse.paid.slice(1)],
    };
    mockOk(dirtyPayload);
    const { container } = render(<Accounts />);
    await waitFor(() => expect(screen.getByText('Paid accounts')).toBeInTheDocument());

    const html = container.innerHTML;
    expect(html).not.toContain('lin_api_supersecret');
    expect(html).not.toContain('hunter2');
    expect(html).not.toContain('kyle@example.com');
    expect(html).not.toContain('kekas');
  });

  it('shows actionable hint on 502/share-not-shared error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        error: 'Notion query failed (404): database not shared',
        hint: 'Share the Accounts database with the Unicron Orchestrator Notion integration (Notion → database → … → Connections).',
      }),
    }) as unknown as typeof fetch;

    render(<Accounts />);
    await waitFor(() => expect(screen.getByText(/Failed to load/i)).toBeInTheDocument());
    expect(screen.getByText(/Share the Accounts database with the Unicron Orchestrator/)).toBeInTheDocument();
  });

  it('renders Active status pill and Infrastructure category chip', async () => {
    mockOk(sampleResponse);
    render(<Accounts />);
    await waitFor(() => expect(screen.getByText('Vercel')).toBeInTheDocument());

    // The first row has Active status and Infrastructure category
    const vercelRow = screen.getByText('Vercel').closest('tr')!;
    expect(within(vercelRow).getByText('Active')).toBeInTheDocument();
    expect(within(vercelRow).getByText('Infrastructure')).toBeInTheDocument();
  });

  it('shows honest empty copy when both sections are empty', async () => {
    mockOk({
      notion_url: NOTION_VIEW_URL,
      paid: [], free: [],
      paid_total_usd: 0, paid_monthly_equivalent_usd: 0,
      fetched_at: '2026-05-13T20:00:00.000Z',
    });
    render(<Accounts />);
    await waitFor(() => expect(screen.getByText(/No paid accounts/i)).toBeInTheDocument());
    expect(screen.getByText(/No free or trial accounts/i)).toBeInTheDocument();
  });
});
