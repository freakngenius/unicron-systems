import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomerDetailView } from './CustomerDetailView';
import type { CustomerOrg } from '../lib/contracts/customers';

const ZEDCOR: CustomerOrg = {
  id: 'zedcor',
  slug: 'zedcor',
  display_name: 'Zedcor Security Solutions',
  status: 'active',
  onboarded_at: '2026-04-01T00:00:00.000Z',
  primary_contact_email: 'ops@zedcor.example.com',
};

describe('CustomerDetailView', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the four metric tiles + sparkline cards after load', async () => {
    render(<CustomerDetailView org={ZEDCOR} onBack={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('customer-detail-health')).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId('health-metric-card')).toHaveLength(4);
    expect(screen.getByTestId('customer-detail-lead-sparkline')).toBeInTheDocument();
    expect(screen.getByTestId('customer-detail-error-sparkline')).toBeInTheDocument();
  });

  it('renders the recent-errors list + active-sources list', async () => {
    render(<CustomerDetailView org={ZEDCOR} onBack={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('customer-detail-errors')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('customer-detail-sources')).toBeInTheDocument();
  });

  it('Back button invokes onBack', async () => {
    const onBack = vi.fn();
    render(<CustomerDetailView org={ZEDCOR} onBack={onBack} />);
    fireEvent.click(screen.getByTestId('customer-detail-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Open Pathfinder link points at the org-scoped Pathfinder URL', async () => {
    render(<CustomerDetailView org={ZEDCOR} onBack={() => {}} />);
    const link = screen.getByTestId('customer-detail-open-pathfinder') as HTMLAnchorElement;
    expect(link.href).toContain('unicron.systems/pathfinder/?org=zedcor');
    expect(link.target).toBe('_blank');
  });
});
