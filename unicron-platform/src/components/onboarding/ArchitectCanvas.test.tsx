import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ArchitectCanvas } from './ArchitectCanvas';
import type { DecompositionArchitecture } from '../../lib/contracts/architect';

const arch: DecompositionArchitecture = {
  buyer: 'distributors of temporary construction-site security',
  buying_signal: 'large new commercial construction permits, value > $1M',
  data_sources_proposed: [
    { type: 'permits', jurisdictions: ['Pittsburgh, PA'], expected_daily_volume: 110 },
    { type: 'sam_gov', jurisdictions: ['US national'], expected_daily_volume: 38 },
  ],
  data_sources_rejected: [],
  layer_2_watchers: [
    { source_type: 'permits', instruction: 'Poll permit feeds.' },
    { source_type: 'sam_gov', instruction: 'Watch sam.gov.' },
  ],
  layer_3_agents: [
    { role: 'Qualifier', instruction: 'Filter by parcel value.' },
  ],
  layer_4_agents: [
    { role: 'Ranker', instruction: 'Score qualified events.' },
  ],
  estimates: {
    daily_qualified_volume: 7,
    cost_per_lead_usd: 0.06,
    architecture_confidence: 'high',
  },
  open_questions: [],
  business_summary: {
    lead_type: 'GC projects',
    business_area: 'Construction security',
    problem_solved: 'Manual scraping',
    what_they_get: 'A ranked daily list',
  },
};

describe('<ArchitectCanvas />', () => {
  it('renders an empty placeholder when architecture is null', () => {
    render(<ArchitectCanvas architecture={null} />);
    expect(screen.getByTestId('architect-canvas-empty')).toBeInTheDocument();
  });

  it('renders the canvas container when architecture is provided', () => {
    render(<ArchitectCanvas architecture={arch} />);
    expect(screen.getByTestId('architect-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('architect-canvas-empty')).not.toBeInTheDocument();
  });

  it('renders a node for the dashboard terminal', () => {
    render(<ArchitectCanvas architecture={arch} />);
    expect(screen.getByTestId('arch-node-dashboard')).toBeInTheDocument();
  });

  it('renders data source nodes labeled by source type', () => {
    render(<ArchitectCanvas architecture={arch} />);
    expect(screen.getByTestId('arch-node-source-permits')).toBeInTheDocument();
    expect(screen.getByTestId('arch-node-source-sam_gov')).toBeInTheDocument();
  });

  it('opens a detail modal when a node is clicked', () => {
    render(<ArchitectCanvas architecture={arch} />);
    const dashNode = screen.getByTestId('arch-node-dashboard');
    fireEvent.click(dashNode);
    const modal = screen.getByTestId('arch-node-detail-modal');
    expect(modal).toBeInTheDocument();
    // Dashboard detail surfaces business_summary copy in the modal.
    expect(within(modal).getByText('A ranked daily list')).toBeInTheDocument();
  });

  it('closes the detail modal on close click', () => {
    render(<ArchitectCanvas architecture={arch} />);
    fireEvent.click(screen.getByTestId('arch-node-dashboard'));
    expect(screen.getByTestId('arch-node-detail-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('arch-node-detail-close'));
    expect(screen.queryByTestId('arch-node-detail-modal')).not.toBeInTheDocument();
  });

  it('clicking a data source node shows source detail in the modal', () => {
    render(<ArchitectCanvas architecture={arch} />);
    fireEvent.click(screen.getByTestId('arch-node-source-permits'));
    const modal = screen.getByTestId('arch-node-detail-modal');
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText('Pittsburgh, PA')).toBeInTheDocument();
  });

  it('clicking an agent node shows the agent instruction', () => {
    render(<ArchitectCanvas architecture={arch} />);
    fireEvent.click(screen.getByTestId('arch-node-agent-Qualifier'));
    const modal = screen.getByTestId('arch-node-detail-modal');
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText('Filter by parcel value.')).toBeInTheDocument();
  });
});
