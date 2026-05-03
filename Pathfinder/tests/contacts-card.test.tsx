// @vitest-environment jsdom
//
// Unit tests for components/lead/ContactsCard + ContactRow (Gate 8C).
// Spec: SPEC - Contact Enrichment.md § UI — Contacts Card.

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

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
  'id' | 'owner_name' | 'score' | 'rejection_reason'
> & { enriched_at: string | null } {
  return {
    id: 'sam.gov:TXDOT-I45-2026-001',
    owner_name: 'Texas Department of Transportation',
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
