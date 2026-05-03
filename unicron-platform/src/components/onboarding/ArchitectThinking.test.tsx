import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ArchitectThinking } from './ArchitectThinking';
import { SettingsProvider } from '../SettingsContext';
import { SystemProvider } from '../../context/SystemContext';
import type { SystemConfig } from '../../context/SystemContext';

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

describe('<ArchitectThinking /> — APPROVE & EDIT flow', () => {
  it('APPROVE & DEPLOY calls onApprove with the recommended (unedited) config', async () => {
    const onApprove = vi.fn();
    renderWithProviders(
      <ArchitectThinking
        buyerPain="public adjusters tracking storm damage"
        onApprove={onApprove}
      />,
    );

    const approveBtn = await screen.findByRole('button', { name: /APPROVE & DEPLOY/i });
    // Wait for the type-on animation to finish revealing every line.
    await waitFor(() => expect(approveBtn).not.toBeDisabled(), { timeout: 4000 });

    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledTimes(1);
    const config = onApprove.mock.calls[0][0] as SystemConfig;
    expect(config.status).toBe('live');
    expect(config.buyerPain).toBe('public adjusters tracking storm damage');
  }, 15_000);

  it('EDIT ARCHITECTURE opens the editor; APPLY EDITS dispatches edited config', async () => {
    const onApprove = vi.fn();
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

    expect(onApprove).toHaveBeenCalledTimes(1);
    const dispatched = onApprove.mock.calls[0][0] as SystemConfig;
    expect(dispatched.status).toBe('live');
    expect(dispatched.buyerPain).toBe('restaurants opening within 30 days');
    expect(dispatched.agents.length).toBeGreaterThan(0);
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
});
