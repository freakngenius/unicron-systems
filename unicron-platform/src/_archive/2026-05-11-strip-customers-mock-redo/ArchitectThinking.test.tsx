import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ArchitectThinking } from './ArchitectThinking';
import { SettingsProvider } from '../SettingsContext';
import { SystemProvider } from '../../context/SystemContext';
import type { SystemConfig } from '../../context/SystemContext';
import { __resetLocalCustomerOrgsForTests } from '../../lib/customersClient';

// JSDOM doesn't implement Canvas 2D — stub the SimEngine the same way
// Visualizer.test.tsx does so the component tree renders without crashing.
vi.mock('../visualizer/simEngine', () => ({
  SimEngine: class {
    constructor() {}
    updateConfig() {}
    setReducedMotion() {}
    pulseAgent() {}
    destroy() {}
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SettingsProvider>
      <SystemProvider>{ui}</SystemProvider>
    </SettingsProvider>,
  );
}

async function clickApproveAndConfirm(slugOverride?: string) {
  const approveBtn = await screen.findByRole('button', { name: /APPROVE & DEPLOY/i });
  await waitFor(() => expect(approveBtn).not.toBeDisabled(), { timeout: 4000 });
  fireEvent.click(approveBtn);
  await screen.findByTestId('approve-deploy-modal');
  if (slugOverride !== undefined) {
    fireEvent.change(screen.getByTestId('approve-deploy-slug-input'), {
      target: { value: slugOverride },
    });
  }
  fireEvent.click(screen.getByTestId('approve-deploy-confirm'));
}

describe('<ArchitectThinking /> — APPROVE & EDIT flow', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
    vi.stubEnv('VITE_CUSTOMER_PERSISTENCE_ENABLED', 'false');
    __resetLocalCustomerOrgsForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetLocalCustomerOrgsForTests();
  });

  it('APPROVE & DEPLOY opens a confirmation modal; confirm fires onApprove with the recommended config', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ArchitectThinking
        buyerPain="public adjusters tracking storm damage"
        onApprove={onApprove}
      />,
    );

    await clickApproveAndConfirm('storm-damage-pa');

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    const [config, meta] = onApprove.mock.calls[0];
    expect((config as SystemConfig).status).toBe('live');
    expect((config as SystemConfig).buyerPain).toBe(
      'public adjusters tracking storm damage',
    );
    expect(meta.slug).toBe('storm-damage-pa');
    expect(meta.name.length).toBeGreaterThan(0);
    expect(meta.architecture).toBeDefined();
  }, 15_000);

  it('EDIT ARCHITECTURE → APPLY EDITS opens the modal; confirm dispatches edited architecture', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ArchitectThinking
        buyerPain="restaurants opening within 30 days"
        onApprove={onApprove}
      />,
    );

    const editBtn = await screen.findByRole('button', { name: /EDIT ARCHITECTURE/i });
    await waitFor(() => expect(editBtn).not.toBeDisabled(), { timeout: 4000 });
    fireEvent.click(editBtn);

    const buyerInput = await screen.findByLabelText('Buyer');
    fireEvent.change(buyerInput, {
      target: { value: 'edited buyer label for the test' },
    });

    fireEvent.click(screen.getByRole('button', { name: /APPLY EDITS/i }));
    await screen.findByTestId('approve-deploy-modal');
    fireEvent.click(screen.getByTestId('approve-deploy-confirm'));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    const [dispatched, meta] = onApprove.mock.calls[0];
    expect((dispatched as SystemConfig).status).toBe('live');
    expect((dispatched as SystemConfig).buyerPain).toBe(
      'restaurants opening within 30 days',
    );
    expect((dispatched as SystemConfig).agents.length).toBeGreaterThan(0);
    expect(meta.architecture.buyer).toBe('edited buyer label for the test');
  }, 15_000);

  it('CANCEL exits edit mode and never invokes onApprove', async () => {
    const onApprove = vi.fn();
    renderWithProviders(
      <ArchitectThinking
        buyerPain="M&A advisors with finance ops gaps"
        onApprove={onApprove}
      />,
    );

    const editBtn = await screen.findByRole('button', { name: /EDIT ARCHITECTURE/i });
    await waitFor(() => expect(editBtn).not.toBeDisabled(), { timeout: 4000 });
    fireEvent.click(editBtn);

    await screen.findByLabelText('Buyer');
    fireEvent.click(screen.getByRole('button', { name: /CANCEL/i }));

    expect(await screen.findByRole('button', { name: /APPROVE & DEPLOY/i })).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
  }, 15_000);

  it('Modal slug input rejects a slug that collides with an existing org (zedcor)', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ArchitectThinking
        buyerPain="public adjusters again"
        onApprove={onApprove}
      />,
    );

    const approveBtn = await screen.findByRole('button', { name: /APPROVE & DEPLOY/i });
    await waitFor(() => expect(approveBtn).not.toBeDisabled(), { timeout: 4000 });
    fireEvent.click(approveBtn);

    await screen.findByTestId('approve-deploy-modal');
    fireEvent.change(screen.getByTestId('approve-deploy-slug-input'), {
      target: { value: 'zedcor' },
    });

    expect(screen.getByTestId('approve-deploy-slug-error')).toHaveTextContent(
      /already taken/i,
    );
    expect(screen.getByTestId('approve-deploy-confirm')).toBeDisabled();
    expect(onApprove).not.toHaveBeenCalled();
  }, 15_000);
});
