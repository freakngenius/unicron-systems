// @vitest-environment jsdom
//
// tests/lead-detail-intercepted-route.test.tsx — Demo Polish UX Gate 15A.
//
// The intercepting-route variant at
// app/@modal/(.)leads/[projectId]/page.tsx must wrap <LeadDetail /> in
// <LeadDetailModal />, so navigation from the dashboard renders the
// modal frame over the live map. We assert the wrapper is present by
// rendering the route's component output directly and checking for the
// modal shell test ids + the new Gate 15A backdrop styling.

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

// Stub LeadDetail so the test focuses on the modal-wrapping behaviour
// (LeadDetail's own rendering is covered by other suites).
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
    neighborIds: ['sam.gov:p1', 'sam.gov:p2'],
    redesignEnabled: true,
    isTopFifty: true,
    fromDisplay: 'kyle@example.com via Gmail',
    isConnected: true,
  })),
  DEMO_OPERATOR_EMAIL: 'kyle@example.com',
}));

// Use a relative import — TS / Vitest can't easily resolve the alias for
// the parenthesised intercept folder name. The relative path bypasses
// alias parsing of the `(.)` prefix.
import InterceptedLeadDetailPage from '../app/@modal/(.)leads/[projectId]/page';

afterEach(() => cleanup());

describe('Intercepted lead detail route — Gate 15A', () => {
  it('wraps <LeadDetail /> in <LeadDetailModal /> with the new backdrop styling', async () => {
    const ui = await InterceptedLeadDetailPage({
      params: { projectId: 'sam.gov%3Ap1' },
    });
    render(ui as React.ReactElement);
    expect(screen.getByTestId('lead-detail-modal-root')).toBeInTheDocument();
    expect(screen.getByTestId('lead-detail-modal-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('lead-detail-stub')).toBeInTheDocument();

    const backdrop = screen.getByTestId('lead-detail-modal-backdrop');
    const bg = backdrop.style.background || backdrop.style.backgroundColor;
    expect(bg).toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.4\s*\)/);
    expect(backdrop.style.backdropFilter).toBe('blur(12px)');
  });
});
