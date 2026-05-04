// @vitest-environment jsdom
//
// tests/lead-detail-standalone-route.test.tsx — Demo Polish UX Gate 15A.
//
// Direct URL loads (refreshes, deep links, opening a lead URL in a new
// tab) hit the standalone route at app/leads/[projectId]/page.tsx and
// must render <LeadDetail /> WITHOUT the <LeadDetailModal /> wrapper —
// the page reads as a full-page lead, not a floating modal on a white
// body. Asserts the modal shell test-ids are absent.

import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error('notFound');
  },
}));

vi.mock('@/components/lead/LeadDetail', () => ({
  LeadDetail: () => <div data-testid="lead-detail-stub">lead detail</div>,
}));

vi.mock('@/lib/lead-detail-data', () => ({
  loadLeadDetailPayload: vi.fn(async () => ({
    project: { id: 'sam.gov:p1', score: 90 },
    latestEmailDraft: null,
    contacts: [],
    leadContacts: [],
    recentEdits: [],
    timelineEvents: [],
    crossPollMatches: [],
    zedcorBranch: null,
    neighborIds: ['sam.gov:p1'],
    redesignEnabled: true,
    isTopFifty: true,
    fromDisplay: 'kyle@example.com via Gmail',
    isConnected: true,
  })),
  DEMO_OPERATOR_EMAIL: 'kyle@example.com',
}));

import StandaloneLeadDetailPage from '@/app/leads/[projectId]/page';

afterEach(() => cleanup());

describe('Standalone lead detail route — Gate 15A', () => {
  it('renders <LeadDetail /> WITHOUT the modal shell', async () => {
    const ui = await StandaloneLeadDetailPage({
      params: { projectId: 'sam.gov%3Ap1' },
    });
    render(ui as React.ReactElement);
    expect(screen.getByTestId('lead-detail-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('lead-detail-modal-root')).toBeNull();
    expect(screen.queryByTestId('lead-detail-modal-backdrop')).toBeNull();
    expect(screen.queryByTestId('lead-detail-modal-card')).toBeNull();
  });
});
