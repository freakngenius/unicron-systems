// @vitest-environment jsdom
//
// Unit tests for components/lead/ContactsCard + ContactRow (Gate 8C).
// Spec: SPEC - Contact Enrichment.md § UI — Contacts Card.

import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Demo Polish UX Gate 12C — RunNowButton now imports useRouter from
// next/navigation to call router.refresh() after a successful POST. Mock
// it so tests can assert refresh fires (replaces the prior
// window.location.reload approach).
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
}));

beforeEach(() => {
  mockRefresh.mockReset();
});
afterEach(() => {
  cleanup();
});

import { ContactsCard } from '@/components/lead/ContactsCard';
import type { LeadContactRow, Project } from '@/lib/types';

function makeContact(over: Partial<LeadContactRow> = {}): LeadContactRow {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    project_id: 'sam.gov:TXDOT-I45-2026-001',
    owner_organization: 'Texas Department of Transportation',
    contact_name: 'Jane Doe',
    role: 'District Security Manager',
    seniority: 'manager',
    email: 'jane.doe@txdot.gov',
    email_status: 'verified',
    phone: '+1-512-555-0100',
    phone_type: 'direct',
    linkedin_url: 'https://linkedin.com/in/janedoe',
    source: 'clay',
    source_confidence: 0.92,
    decision_authority: 'champion',
    enriched_at: '2026-05-02T22:00:00Z',
    last_verified_at: null,
    notes: null,
    ...over,
  };
}

function makeProject(over: Partial<Project> = {}): Pick<
  Project,
  'id' | 'owner_name' | 'source' | 'score' | 'rejection_reason'
> & { enriched_at: string | null } {
  return {
    id: 'sam.gov:TXDOT-I45-2026-001',
    owner_name: 'Texas Department of Transportation',
    source: 'sam.gov',
    score: 80,
    rejection_reason: null,
    enriched_at: '2026-05-02T22:00:00Z',
    ...over,
  } as ReturnType<typeof makeProject>;
}

describe('ContactsCard — populated state', () => {
  it('renders header with count + owner name', () => {
    const project = makeProject();
    render(
      <ContactsCard
        project={project}
        contacts={[makeContact(), makeContact({ contact_name: 'John Roe' })]}
      />,
    );
    expect(
      screen.getByText(/Contacts — 2 at Texas Department of Transportation/),
    ).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('John Roe')).toBeInTheDocument();
  });

  it('renders decision-authority chip color-coded', () => {
    render(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ decision_authority: 'signer' })]}
      />,
    );
    // Chip renders the decision_authority text uppercased.
    expect(screen.getByText(/SIGNER/i)).toBeInTheDocument();
  });

  it('hides low-confidence rows by default', () => {
    render(
      <ContactsCard
        project={makeProject()}
        contacts={[
          makeContact({ contact_name: 'Visible', source_confidence: 0.8 }),
          makeContact({ contact_name: 'Hidden', source_confidence: 0.3 }),
          makeContact({ contact_name: 'NullConf', source_confidence: null }),
        ]}
      />,
    );
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.getByText('NullConf')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});

describe('ContactsCard — empty states', () => {
  it('top-50 lead with no contacts → "Enrichment pending" + admin sees Run now', () => {
    render(
      <ContactsCard
        project={makeProject({ score: 80 })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    expect(screen.getByTestId('contacts-empty-pending')).toBeInTheDocument();
    expect(screen.getByTestId('contacts-run-now')).toBeInTheDocument();
  });

  it('non-admin top-50 pending hides Run now', () => {
    render(
      <ContactsCard
        project={makeProject({ score: 80 })}
        contacts={[]}
        isTopFifty
        isAdmin={false}
      />,
    );
    expect(screen.getByTestId('contacts-empty-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('contacts-run-now')).not.toBeInTheDocument();
  });

  it('sub-top-50 lead → "Request enrichment" link', () => {
    render(
      <ContactsCard
        project={makeProject({ score: 25 })}
        contacts={[]}
        isTopFifty={false}
      />,
    );
    expect(screen.getByTestId('contacts-empty-below')).toBeInTheDocument();
    expect(screen.getByTestId('contacts-request-enrichment')).toBeInTheDocument();
  });

  it('owner unknown / pre-award → muted message', () => {
    render(
      <ContactsCard
        project={makeProject({ owner_name: 'Pre-award (no awardee yet)' })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    expect(
      screen.getByTestId('contacts-empty-owner-unknown'),
    ).toBeInTheDocument();
    // Run-now should not surface for owner-unknown — orchestrator skips
    // these entirely.
    expect(screen.queryByTestId('contacts-run-now')).not.toBeInTheDocument();
  });

  it('owner null → owner-unknown empty state', () => {
    render(
      <ContactsCard
        project={makeProject({ owner_name: null })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    expect(
      screen.getByTestId('contacts-empty-owner-unknown'),
    ).toBeInTheDocument();
  });
});

describe('ContactsCard — copy actions', () => {
  it('Copy email writes to clipboard + fires toast', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ email: 'test@x.com' })]}
      />,
    );
    fireEvent.click(screen.getByTestId('contact-copy-email'));
    expect(writeText).toHaveBeenCalledWith('test@x.com');
    expect(screen.getByTestId('contact-toast').textContent).toContain('test@x.com');
  });

  it('Copy phone writes to clipboard + fires toast', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ phone: '+1-555-0100' })]}
      />,
    );
    fireEvent.click(screen.getByTestId('contact-copy-phone'));
    expect(writeText).toHaveBeenCalledWith('+1-555-0100');
    expect(screen.getByTestId('contact-toast').textContent).toContain('+1-555-0100');
  });

  it('Copy buttons disabled when no email / phone', () => {
    render(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ email: null, phone: null })]}
      />,
    );
    expect(screen.getByTestId('contact-copy-email')).toBeDisabled();
    expect(screen.getByTestId('contact-copy-phone')).toBeDisabled();
  });
});

describe('ContactsCard — Use as outreach recipient', () => {
  it('fires onSetRecipient with email + name', () => {
    const onSetRecipient = vi.fn();
    render(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ email: 'jane@txdot.gov', contact_name: 'Jane Doe' })]}
        onSetRecipient={onSetRecipient}
      />,
    );
    fireEvent.click(screen.getByTestId('contact-use-recipient'));
    expect(onSetRecipient).toHaveBeenCalledWith('jane@txdot.gov', 'Jane Doe');
  });

  it('disables Use as recipient when no email or no callback', () => {
    const { rerender } = render(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ email: null })]}
        onSetRecipient={() => undefined}
      />,
    );
    expect(screen.getByTestId('contact-use-recipient')).toBeDisabled();

    rerender(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ email: 'a@x.com' })]}
      />,
    );
    expect(screen.getByTestId('contact-use-recipient')).toBeDisabled();
  });
});

describe('ContactsCard — chips and source citations', () => {
  it('renders source citation + confidence chip', () => {
    render(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ source: 'apollo', source_confidence: 0.85 })]}
      />,
    );
    const row = screen.getByTestId('contact-row');
    expect(within(row).getByText(/source: apollo/i)).toBeInTheDocument();
    expect(within(row).getByText(/conf 85%/i)).toBeInTheDocument();
  });

  it('renders email-status visual cue (guessed text shown for guessed status)', () => {
    render(
      <ContactsCard
        project={makeProject()}
        contacts={[makeContact({ email: 'a@x.com', email_status: 'guessed' })]}
      />,
    );
    expect(screen.getByText(/^guessed$/i)).toBeInTheDocument();
  });
});

describe('ContactsCard — Gate 9B per-source publishing note', () => {
  it('renders the sam.gov publishing note when contacts are empty', () => {
    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov', score: 80 })}
        contacts={[]}
        isTopFifty={true}
      />,
    );
    const note = screen.getByTestId('contacts-source-publishing-note');
    expect(note).toHaveAttribute('data-source', 'sam.gov');
    expect(note).toHaveTextContent(/sam\.gov publishes pointOfContact/i);
  });

  it('renders the USAspending note for usaspending source', () => {
    render(
      <ContactsCard
        project={makeProject({ source: 'usaspending', score: 80 })}
        contacts={[]}
        isTopFifty={true}
      />,
    );
    const note = screen.getByTestId('contacts-source-publishing-note');
    expect(note).toHaveAttribute('data-source', 'usaspending');
    expect(note).toHaveTextContent(/USAspending does not publish/i);
  });

  it('renders the Harris note for harris source', () => {
    render(
      <ContactsCard
        project={makeProject({ source: 'harris', score: 80 })}
        contacts={[]}
        isTopFifty={true}
      />,
    );
    const note = screen.getByTestId('contacts-source-publishing-note');
    expect(note).toHaveAttribute('data-source', 'harris');
    expect(note).toHaveTextContent(/Harris County permits/i);
  });

  it('renders the news note for news source', () => {
    render(
      <ContactsCard
        project={makeProject({ source: 'news', score: 80 })}
        contacts={[]}
        isTopFifty={true}
      />,
    );
    const note = screen.getByTestId('contacts-source-publishing-note');
    expect(note).toHaveAttribute('data-source', 'news');
    expect(note).toHaveTextContent(/news articles rarely include/i);
  });

  it('renders the publishing note in the belowThreshold (sub-top-50) empty state', () => {
    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov', score: 30 })}
        contacts={[]}
        isTopFifty={false}
      />,
    );
    expect(screen.getByTestId('contacts-empty-below')).toBeInTheDocument();
    expect(
      screen.getByTestId('contacts-source-publishing-note'),
    ).toHaveTextContent(/sam\.gov/);
  });

  it('renders the publishing note in the ownerUnknown empty state', () => {
    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov', owner_name: null, score: 80 })}
        contacts={[]}
        isTopFifty={true}
      />,
    );
    expect(screen.getByTestId('contacts-empty-owner-unknown')).toBeInTheDocument();
    expect(
      screen.getByTestId('contacts-source-publishing-note'),
    ).toHaveTextContent(/sam\.gov/);
  });

  it('does NOT render the publishing note when contacts exist', () => {
    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov' })}
        contacts={[makeContact()]}
      />,
    );
    expect(
      screen.queryByTestId('contacts-source-publishing-note'),
    ).toBeNull();
  });
});

describe('ContactsCard — Gate 12C Run Now UI refresh', () => {
  function setupFetchMock(
    response: Partial<Response> & {
      jsonBody?: unknown;
      okOverride?: boolean;
      statusOverride?: number;
    },
  ) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: response.okOverride ?? true,
      status: response.statusOverride ?? 200,
      json: () => Promise.resolve(response.jsonBody ?? {}),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows "Running enrichment…" while the POST is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => pending),
    );

    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov', score: 80 })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    // Initial copy
    expect(screen.getByTestId('contacts-empty-pending')).toHaveTextContent(
      /click Run now to fetch/i,
    );
    fireEvent.click(screen.getByTestId('contacts-run-now'));
    await waitFor(() => {
      expect(screen.getByTestId('contacts-empty-pending')).toHaveTextContent(
        /Running enrichment/i,
      );
    });
    expect(screen.getByTestId('contacts-run-now')).toBeDisabled();
    // Cleanup pending promise
    resolveFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, inserted: 0, message: 'done.' }),
    });
  });

  it('on success calls router.refresh() so server-rendered contacts re-fetch', async () => {
    setupFetchMock({
      jsonBody: {
        ok: true,
        inserted: 2,
        source: 'sam.gov',
        message: 'Inserted 2 contacts from sam.gov pointOfContact.',
      },
    });
    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov', score: 80 })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    fireEvent.click(screen.getByTestId('contacts-run-now'));
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the response message inline so 0-insert results are visible', async () => {
    setupFetchMock({
      jsonBody: {
        ok: true,
        inserted: 0,
        source: 'usaspending',
        message:
          'USAspending does not publish decision-maker contacts. Clay / Apollo / Hunter enrichment pending (Gate 8B).',
      },
    });
    render(
      <ContactsCard
        project={makeProject({ source: 'usaspending', score: 80 })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    fireEvent.click(screen.getByTestId('contacts-run-now'));
    const note = await screen.findByTestId('contacts-run-now-result');
    expect(note).toHaveAttribute('data-kind', 'success');
    expect(note).toHaveTextContent(/USAspending does not publish/i);
  });

  it('reports inserted count when the endpoint inserts rows', async () => {
    setupFetchMock({
      jsonBody: {
        ok: true,
        inserted: 2,
        source: 'sam.gov',
        message: 'Inserted 2 contacts from sam.gov pointOfContact.',
      },
    });
    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov', score: 80 })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    fireEvent.click(screen.getByTestId('contacts-run-now'));
    const note = await screen.findByTestId('contacts-run-now-result');
    expect(note).toHaveTextContent(/inserted 2 contacts/i);
  });

  it('surfaces a recoverable error when the endpoint returns non-2xx', async () => {
    setupFetchMock({
      okOverride: false,
      statusOverride: 500,
      jsonBody: { ok: false, error: 'lead_contacts insert failed: oops' },
    });
    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov', score: 80 })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    fireEvent.click(screen.getByTestId('contacts-run-now'));
    const note = await screen.findByTestId('contacts-run-now-result');
    expect(note).toHaveAttribute('data-kind', 'error');
    expect(note).toHaveTextContent(/Run failed:/i);
    expect(note).toHaveTextContent(/insert failed/i);
    // Button should be re-enabled so the operator can retry.
    expect(screen.getByTestId('contacts-run-now')).not.toBeDisabled();
    // No router refresh on failure.
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('surfaces a recoverable error on network failure (fetch throws)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    render(
      <ContactsCard
        project={makeProject({ source: 'sam.gov', score: 80 })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    fireEvent.click(screen.getByTestId('contacts-run-now'));
    const note = await screen.findByTestId('contacts-run-now-result');
    expect(note).toHaveAttribute('data-kind', 'error');
    expect(note).toHaveTextContent(/network down/i);
    expect(screen.getByTestId('contacts-run-now')).not.toBeDisabled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('POSTs to the correct endpoint URL with force=1', async () => {
    const fetchMock = setupFetchMock({
      jsonBody: { ok: true, inserted: 0, message: 'noop' },
    });
    render(
      <ContactsCard
        project={makeProject({
          id: 'sam.gov:NOTICE-ABC',
          source: 'sam.gov',
          score: 80,
        })}
        contacts={[]}
        isTopFifty
        isAdmin
      />,
    );
    fireEvent.click(screen.getByTestId('contacts-run-now'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      '/pathfinder/api/leads/sam.gov%3ANOTICE-ABC/enrich-contacts?force=1',
    );
    expect(init).toMatchObject({ method: 'POST' });
  });
});
