import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomersView } from './CustomersView';
import {
  __resetLocalCustomerOrgsForTests,
  createCustomerOrg,
} from '../lib/customersClient';

describe('CustomersView', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
    vi.stubEnv('VITE_CUSTOMER_PERSISTENCE_ENABLED', 'false');
    __resetLocalCustomerOrgsForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetLocalCustomerOrgsForTests();
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

  it('renders multiple cards once a second org is persisted, hiding the single-tenant note', async () => {
    await createCustomerOrg({
      name: 'Acme Roofing',
      slug: 'acme-roofing',
      architecture: null,
    });
    render(<CustomersView onSelect={() => {}} />);
    await waitFor(() => {
      const cards = screen.getAllByTestId('customer-card');
      expect(cards).toHaveLength(2);
    });
    expect(screen.queryByTestId('customers-single-tenant-note')).not.toBeInTheDocument();
    const slugs = screen
      .getAllByTestId('customer-card')
      .map((el) => el.getAttribute('data-org-id'));
    expect(slugs).toContain('zedcor');
    expect(slugs).toContain('acme-roofing');
  });
});
