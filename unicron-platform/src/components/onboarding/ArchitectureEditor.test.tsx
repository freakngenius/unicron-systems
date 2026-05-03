import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArchitectureEditor } from './ArchitectureEditor';
import type { DecompositionArchitecture } from '../../lib/contracts/architect';

const baseArchitecture: DecompositionArchitecture = {
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
    { role: 'Qualifier', instruction: 'Filter by value.' },
    { role: 'Enricher', instruction: 'Resolve GC contact.' },
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
};

describe('<ArchitectureEditor />', () => {
  it('renders editable fields seeded from the source architecture', () => {
    render(
      <ArchitectureEditor
        architecture={baseArchitecture}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Buyer')).toHaveValue(baseArchitecture.buyer);
    expect(screen.getByLabelText('Buying signal')).toHaveValue(
      baseArchitecture.buying_signal,
    );
  });

  it('APPLY EDITS commits the edited architecture (not the original)', () => {
    const onApply = vi.fn();
    render(
      <ArchitectureEditor
        architecture={baseArchitecture}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );

    // Edit BUYER.
    fireEvent.change(screen.getByLabelText('Buyer'), {
      target: { value: 'public adjusters tracking storm damage' },
    });
    // Add a new L3 agent.
    fireEvent.click(screen.getByRole('button', { name: /\+ ADD L3 AGENT/i }));
    // Remove the second watcher.
    fireEvent.click(screen.getByRole('button', { name: /Remove Watcher 2/i }));

    fireEvent.click(screen.getByRole('button', { name: /APPLY EDITS/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const edited = onApply.mock.calls[0][0] as DecompositionArchitecture;
    expect(edited.buyer).toBe('public adjusters tracking storm damage');
    expect(edited.layer_3_agents).toHaveLength(baseArchitecture.layer_3_agents.length + 1);
    expect(edited.layer_2_watchers).toHaveLength(baseArchitecture.layer_2_watchers.length - 1);
    // Source architecture must remain unmutated.
    expect(baseArchitecture.buyer).toBe('distributors of temporary construction-site security');
    expect(baseArchitecture.layer_3_agents).toHaveLength(2);
  });

  it('CANCEL discards the local draft and never invokes onApply', () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(
      <ArchitectureEditor
        architecture={baseArchitecture}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByLabelText('Buyer'), {
      target: { value: 'something else entirely' },
    });
    fireEvent.click(screen.getByRole('button', { name: /CANCEL/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('parses comma-separated jurisdictions into an array of trimmed strings', () => {
    const onApply = vi.fn();
    render(
      <ArchitectureEditor
        architecture={baseArchitecture}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Data source 1 jurisdictions'), {
      target: { value: 'Florida, Texas , California' },
    });
    fireEvent.click(screen.getByRole('button', { name: /APPLY EDITS/i }));

    const edited = onApply.mock.calls[0][0] as DecompositionArchitecture;
    expect(edited.data_sources_proposed[0].jurisdictions).toEqual([
      'Florida',
      'Texas',
      'California',
    ]);
  });
});
