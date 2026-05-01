import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Visualizer } from './Visualizer';
import type { SystemConfig } from '../../context/SystemContext';

// Mock SimEngine — we're testing the React shell + HUD override, not the
// canvas simulation. JSDOM does not implement Canvas 2D so the engine would
// crash on `getContext('2d')` regardless.
vi.mock('./simEngine', () => ({
  SimEngine: class {
    constructor() {
      // no-op
    }
    updateConfig() {}
    setReducedMotion() {}
    pulseAgent() {}
    destroy() {}
  },
}));

const baseConfig: SystemConfig = {
  status: 'live',
  buyerPain: 'test pain',
  dataSources: [],
  agents: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<Visualizer /> HUD override', () => {
  it('renders the simulation HUD by default (zeros at boot)', () => {
    render(<Visualizer config={baseConfig} showInternalCostMetrics={false} density="full" />);
    // Default sim HUD initializes signalsProcessed=0, decisionsMade=0, etc.
    expect(screen.getByText('signals.processed')).toBeInTheDocument();
    expect(screen.getByText('reports.delivered')).toBeInTheDocument();
  });

  it('renders the override HUD values when hudOverride is provided', () => {
    render(
      <Visualizer
        config={baseConfig}
        showInternalCostMetrics
        density="full"
        hudOverride={{
          signalsProcessed: 4242,
          signalsRejected: 17,
          decisionsMade: 88,
          valueSurfaced: 1_750_000,
          reportsDelivered: 9,
          activeNodes: 3,
          costPerReport: 0.124,
        }}
      />,
    );
    expect(screen.getByText('4,242')).toBeInTheDocument();
    expect(screen.getByText('$1.75M')).toBeInTheDocument();
    expect(screen.getByText('$0.124')).toBeInTheDocument();
  });

  it('hides the HUD strip when showHud is false', () => {
    render(
      <Visualizer
        config={baseConfig}
        showInternalCostMetrics={false}
        density="full"
        showHud={false}
      />,
    );
    expect(screen.queryByText('signals.processed')).not.toBeInTheDocument();
  });
});
