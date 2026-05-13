// Phase 2E Slice 3 — Metacron UI for the onboarding-to-live state machine.
//
// Asserts the status badge renders for every state in the 6-step union and
// that the "OPEN PATHFINDER FOR X" button is gated by status — disabled for
// setting_up / first_run / ranking / awaiting_threshold, enabled for
// ready_to_view / operator_viewed. Disabled variant keeps the same testid
// and surfaces an inline title=… reason.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CustomerDetailView } from './CustomerDetailView';
import type { CustomerOrg, OrgStatus, OrgHealthRollup } from '../lib/contracts/customers';

// getOrgHealth is fired in useEffect; stub it to a deterministic empty rollup
// so the detail body skeleton resolves quickly and we can assert the header.
vi.mock('../lib/customersClient', () => ({
  getOrgHealth: vi.fn(async (orgId: string): Promise<OrgHealthRollup> => ({
    org_id: orgId,
    lead_volume_30d: new Array(30).fill(0),
    lead_volume_7d_total: 0,
    lead_volume_30d_total: 0,
    high_score_rate_7d: 0,
    outreach_delivery_rate_7d: 0,
    error_volume_30d: new Array(30).fill(0),
    error_total_7d: 0,
    error_rate_7d: 0,
    recent_errors: [],
    active_sources: [],
  })),
}));

const baseOrg = (status: OrgStatus): CustomerOrg => ({
  id: 'realberry-uuid',
  slug: 'realberry',
  display_name: 'Realberry',
  status,
  onboarded_at: '2026-05-12T00:00:00.000Z',
});

const ENABLED_STATUSES: OrgStatus[] = ['ready_to_view', 'operator_viewed'];
const DISABLED_STATUSES: OrgStatus[] = [
  'setting_up',
  'first_run',
  'ranking',
  'awaiting_threshold',
];

const ALL_STATUSES: OrgStatus[] = [...DISABLED_STATUSES, ...ENABLED_STATUSES];

const BADGE_LABEL: Record<OrgStatus, string> = {
  setting_up: 'setting up',
  first_run: 'first run',
  ranking: 'ranking',
  awaiting_threshold: 'awaiting threshold',
  ready_to_view: 'ready to view',
  operator_viewed: 'live',
};

describe('CustomerDetailView · status badge + gated Open Pathfinder button', () => {
  beforeEach(() => {
    // Ensure each render is isolated.
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  for (const status of ALL_STATUSES) {
    it(`renders the status badge with label for status=${status}`, async () => {
      render(<CustomerDetailView org={baseOrg(status)} onBack={() => {}} />);
      const badge = await screen.findByTestId('customer-detail-status-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent?.toLowerCase()).toContain(BADGE_LABEL[status]);
    });
  }

  for (const status of ENABLED_STATUSES) {
    it(`enables Open Pathfinder button at status=${status}`, async () => {
      render(<CustomerDetailView org={baseOrg(status)} onBack={() => {}} />);
      const link = await screen.findByTestId('customer-detail-open-pathfinder');
      // Anchor element with href present
      expect(link.tagName).toBe('A');
      expect((link as HTMLAnchorElement).href).toContain(
        'unicron.systems/pathfinder/realberry',
      );
      // Not disabled
      expect(link.getAttribute('aria-disabled')).not.toBe('true');
    });
  }

  for (const status of DISABLED_STATUSES) {
    it(`disables Open Pathfinder button at status=${status} with a reason title`, async () => {
      render(<CustomerDetailView org={baseOrg(status)} onBack={() => {}} />);
      const btn = await screen.findByTestId('customer-detail-open-pathfinder');
      // Disabled variant renders as <button>, not <a>, so it cannot navigate.
      expect(btn.tagName).toBe('BUTTON');
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      // Reason is exposed inline via title= for the operator.
      const title = btn.getAttribute('title') ?? '';
      expect(title.length).toBeGreaterThan(0);
    });
  }

  it('still renders the button text "OPEN PATHFINDER FOR {NAME} →" regardless of state', async () => {
    render(<CustomerDetailView org={baseOrg('setting_up')} onBack={() => {}} />);
    const el = await screen.findByTestId('customer-detail-open-pathfinder');
    expect(el.textContent).toContain('OPEN PATHFINDER FOR REALBERRY');
    expect(el.textContent).toContain('→');
  });

  it('renders the body health block (skeleton/empty) after mock rollup resolves', async () => {
    render(<CustomerDetailView org={baseOrg('ready_to_view')} onBack={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('customer-detail-health')).toBeInTheDocument(),
    );
  });
});
