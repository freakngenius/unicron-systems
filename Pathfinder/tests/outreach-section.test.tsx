// @vitest-environment jsdom
//
// tests/outreach-section.test.tsx — Demo Polish UX Gate 9C.
//
// OutreachSection covers the v2 page's two-button drafter + Composer
// composition. Network calls to the drafter and send endpoints are
// stubbed via vi.spyOn(global, 'fetch').

import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { OutreachSection } from '@/components/lead/OutreachSection';
import type { LeadContactRow, OutreachEdit } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeContact(over: Partial<LeadContactRow> = {}): LeadContactRow {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    project_id: 'p1',
    owner_organization: 'TxDOT',
    contact_name: 'Jane Doe',
    role: 'District Security Manager',
    seniority: 'manager',
    email: 'jane.doe@txdot.gov',
    email_status: 'verified',
    phone: null,
    phone_type: null,
    linkedin_url: null,
    source: 'clay',
    source_confidence: 0.9,
    decision_authority: 'champion',
    enriched_at: '2026-05-02T00:00:00Z',
    last_verified_at: null,
    notes: null,
    ...over,
  };
}

function renderSection(
  overrides: Partial<React.ComponentProps<typeof OutreachSection>> = {},
) {
  const baseProps: React.ComponentProps<typeof OutreachSection> = {
    projectId: 'sam.gov:TXDOT-I45-2026-001',
    leadContacts: [makeContact()],
    recentEdits: [],
    fromDisplay: 'kyle@freakngenius.com via Gmail',
    isConnected: true,
  };
  return render(<OutreachSection {...baseProps} {...overrides} />);
}

describe('OutreachSection — initial state', () => {
  it('renders the two action buttons + composer', () => {
    renderSection();
    expect(screen.getByTestId('outreach-draft-recommended')).toBeInTheDocument();
    expect(screen.getByTestId('outreach-custom')).toBeInTheDocument();
    expect(screen.getByTestId('outreach-composer')).toBeInTheDocument();
  });

  it('seeds the To field with the highest-confidence contact email', () => {
    renderSection();
    const to = screen.getByTestId('outreach-composer-to') as HTMLInputElement;
    expect(to.value).toBe('jane.doe@txdot.gov');
  });

  it('renders the From display when connected', () => {
    renderSection();
    expect(screen.getByTestId('outreach-composer-from')).toHaveTextContent(
      /kyle@freakngenius\.com via Gmail/,
    );
  });

  it('shows the Connect link when not connected and disables Send', () => {
    renderSection({ isConnected: false });
    expect(screen.getByTestId('outreach-composer-connect-link')).toBeInTheDocument();
    expect(screen.getByTestId('outreach-composer-send')).toBeDisabled();
  });

  it('does NOT render Sent History when no recent edits', () => {
    renderSection();
    expect(screen.queryByTestId('outreach-sent-history')).toBeNull();
  });

  it('renders Sent History when recent edits exist', () => {
    const edit: OutreachEdit = {
      id: 'e1',
      project_id: 'sam.gov:TXDOT-I45-2026-001',
      created_at: '2026-05-02T20:00:00Z',
      sent_at: '2026-05-02T20:00:00Z',
      sent_subject: 'Hello',
      provider: 'gmail',
      edit_distance: 12,
      send_error: null,
    } as unknown as OutreachEdit;
    renderSection({ recentEdits: [edit] });
    expect(screen.getByTestId('outreach-sent-history')).toBeInTheDocument();
  });
});

describe('OutreachSection — Draft recommended outreach', () => {
  it('calls the drafter endpoint and populates the composer on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          subject: '20-min call on I-45 perimeter security?',
          body: 'Specific reference. Why now. Two time slots Tuesday or Thursday.',
          suggested_recipient_email: 'jane.doe@txdot.gov',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ) as unknown as Response,
    );
    renderSection();
    fireEvent.click(screen.getByTestId('outreach-draft-recommended'));
    await waitFor(() => {
      const subject = screen.getByTestId('outreach-composer-subject') as HTMLInputElement;
      expect(subject.value).toBe('20-min call on I-45 perimeter security?');
    });
    const body = screen.getByTestId('outreach-composer-body') as HTMLTextAreaElement;
    expect(body.value).toContain('Specific reference');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/pathfinder\/api\/leads\/.+\/outreach\/draft$/),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces drafter error when the endpoint fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }) as unknown as Response,
    );
    renderSection();
    fireEvent.click(screen.getByTestId('outreach-draft-recommended'));
    await waitFor(() => {
      expect(screen.getByTestId('outreach-draft-error')).toHaveTextContent(/rate limited/);
    });
  });

  it('uses the suggested_recipient_email from drafter when present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          subject: 'S',
          body: 'B',
          suggested_recipient_email: 'pinned@txdot.gov',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ) as unknown as Response,
    );
    renderSection();
    fireEvent.click(screen.getByTestId('outreach-draft-recommended'));
    await waitFor(() => {
      const to = screen.getByTestId('outreach-composer-to') as HTMLInputElement;
      expect(to.value).toBe('pinned@txdot.gov');
    });
  });
});

describe('OutreachSection — Custom outreach', () => {
  it('clears all composer fields on click', () => {
    renderSection();
    const to = screen.getByTestId('outreach-composer-to') as HTMLInputElement;
    const subject = screen.getByTestId('outreach-composer-subject') as HTMLInputElement;
    const body = screen.getByTestId('outreach-composer-body') as HTMLTextAreaElement;

    // Pre-fill some content and verify Custom-outreach clears + reseeds.
    fireEvent.change(subject, { target: { value: 'pre-filled' } });
    fireEvent.change(body, { target: { value: 'pre-filled body' } });
    fireEvent.click(screen.getByTestId('outreach-custom'));
    // Custom outreach reseeds To from the contact list, blanks subject + body.
    expect(to.value).toBe('jane.doe@txdot.gov');
    expect(subject.value).toBe('');
    expect(body.value).toBe('');
  });
});

describe('OutreachSection — bridge overrides', () => {
  it('honors a bodyOverride from the parent (CrossPollination hook insertion)', () => {
    const { rerender } = render(
      <OutreachSection
        projectId="p1"
        leadContacts={[makeContact()]}
        recentEdits={[]}
        fromDisplay="kyle@x.com via Gmail"
        isConnected={true}
        bodyOverride={null}
      />,
    );
    rerender(
      <OutreachSection
        projectId="p1"
        leadContacts={[makeContact()]}
        recentEdits={[]}
        fromDisplay="kyle@x.com via Gmail"
        isConnected={true}
        bodyOverride={{ text: 'WARM HOOK', nonce: 1 }}
      />,
    );
    const body = screen.getByTestId('outreach-composer-body') as HTMLTextAreaElement;
    expect(body.value).toContain('WARM HOOK');
  });

  it('honors a recipientOverride from the parent (Use as recipient)', () => {
    const { rerender } = render(
      <OutreachSection
        projectId="p1"
        leadContacts={[]}
        recentEdits={[]}
        fromDisplay="kyle@x.com via Gmail"
        isConnected={true}
        recipientOverride={null}
      />,
    );
    rerender(
      <OutreachSection
        projectId="p1"
        leadContacts={[]}
        recentEdits={[]}
        fromDisplay="kyle@x.com via Gmail"
        isConnected={true}
        recipientOverride={{ email: 'override@txdot.gov', nonce: 1 }}
      />,
    );
    const to = screen.getByTestId('outreach-composer-to') as HTMLInputElement;
    expect(to.value).toBe('override@txdot.gov');
  });
});
