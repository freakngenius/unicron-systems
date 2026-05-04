import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Onboarding } from './Onboarding';
import { SettingsProvider } from '../SettingsContext';
import { SystemProvider } from '../../context/SystemContext';
import { __resetLocalCustomerOrgsForTests } from '../../lib/customersClient';

vi.mock('../visualizer/simEngine', () => ({
  SimEngine: class {
    constructor() {}
    updateConfig() {}
    setReducedMotion() {}
    pulseAgent() {}
    destroy() {}
  },
}));

// Skip the cluster-build animation: BuildingCluster fires onComplete after
// a long scripted timeline. For this integration test we only care that
// onCustomerCreated gets the persisted org once SystemDeployed's primary
// action is invoked.
vi.mock('./BuildingCluster', () => ({
  BuildingCluster: ({ onComplete }: { onComplete: () => void }) => {
    setTimeout(onComplete, 0);
    return <div data-testid="building-stub" />;
  },
}));

function renderOnboarding(props: {
  onOpenLive: () => void;
  onCustomerCreated?: (org: { slug: string; display_name: string }) => void;
}) {
  return render(
    <SettingsProvider>
      <SystemProvider>
        <Onboarding {...props} />
      </SystemProvider>
    </SettingsProvider>,
  );
}

async function driveDefineThenApprove(slug: string) {
  // Define pain — find the textarea / submit button (DefinePain ships with
  // a submit button labeled "BEGIN" or similar; fall back to the form).
  const textareas = await screen.findAllByRole('textbox');
  const promptInput = textareas[0];
  fireEvent.change(promptInput, {
    target: { value: 'public adjusters tracking storm damage' },
  });
  const submit = screen.getByRole('button', { name: /architect/i });
  fireEvent.click(submit);

  // Wait for the architect screen and its APPROVE button.
  const approveBtn = await screen.findByRole(
    'button',
    { name: /APPROVE & DEPLOY/i },
    { timeout: 5000 },
  );
  await waitFor(() => expect(approveBtn).not.toBeDisabled(), { timeout: 6000 });
  fireEvent.click(approveBtn);

  await screen.findByTestId('approve-deploy-modal');
  fireEvent.change(screen.getByTestId('approve-deploy-slug-input'), {
    target: { value: slug },
  });
  fireEvent.click(screen.getByTestId('approve-deploy-confirm'));
}

describe('<Onboarding /> — post-approve customer redirect', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
    vi.stubEnv('VITE_CUSTOMER_PERSISTENCE_ENABLED', 'false');
    __resetLocalCustomerOrgsForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetLocalCustomerOrgsForTests();
  });

  it('persists the new org and invokes onCustomerCreated after deployed', async () => {
    const onOpenLive = vi.fn();
    const onCustomerCreated = vi.fn();
    renderOnboarding({ onOpenLive, onCustomerCreated });

    await driveDefineThenApprove('acme-roofing');

    // Wait for SystemDeployed (the cluster-build mock auto-fires onComplete).
    const openBtn = await screen.findByRole(
      'button',
      { name: /OPEN LIVE SYSTEM|GO LIVE|OPEN/i },
      { timeout: 8000 },
    );
    fireEvent.click(openBtn);

    expect(onCustomerCreated).toHaveBeenCalledTimes(1);
    expect(onCustomerCreated.mock.calls[0][0].slug).toBe('acme-roofing');
    expect(onOpenLive).not.toHaveBeenCalled();
  }, 20_000);
});
