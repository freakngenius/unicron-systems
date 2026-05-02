import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomersView } from './CustomersView';

describe('CustomersView', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the Zedcor card after the loader settles', async () => {
    render(<CustomersView onSelect={() => {}} />);
    expect(screen.getByTestId('customers-skeleton')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('customers-grid')).toBeInTheDocument());
    expect(screen.getByTestId('customer-card')).toHaveAttribute('data-org-id', 'zedcor');
  });

  it('renders the single-tenant note when only one org is registered', async () => {
    render(<CustomersView onSelect={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('customers-single-tenant-note')).toBeInTheDocument(),
    );
  });

  it('clicking a card invokes onSelect with the org row', async () => {
    const onSelect = vi.fn();
    render(<CustomersView onSelect={onSelect} />);
    await waitFor(() => expect(screen.getByTestId('customer-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('customer-card'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('zedcor');
  });
});
