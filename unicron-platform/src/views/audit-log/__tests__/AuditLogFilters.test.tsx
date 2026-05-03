import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLogFilters, type AuditLogFilterState } from '../AuditLogFilters';

const baseState: AuditLogFilterState = {
  verifiedBy: '',
  agentName: '',
  window: '7d',
};

describe('AuditLogFilters', () => {
  it('renders all three filter controls', () => {
    render(<AuditLogFilters value={baseState} onChange={() => {}} />);
    expect(screen.getByTestId('audit-log-filter-verified-by')).toBeInTheDocument();
    expect(screen.getByTestId('audit-log-filter-agent')).toBeInTheDocument();
    expect(screen.getByTestId('audit-log-filter-window')).toBeInTheDocument();
  });

  it('emits onChange with updated verifiedBy when typing', () => {
    const onChange = vi.fn();
    render(<AuditLogFilters value={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('audit-log-filter-verified-by'), {
      target: { value: 'kyle' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...baseState, verifiedBy: 'kyle' });
  });

  it('emits onChange with updated window when selecting', () => {
    const onChange = vi.fn();
    render(<AuditLogFilters value={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('audit-log-filter-window'), {
      target: { value: '24h' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...baseState, window: '24h' });
  });

  it('renders agent control as a select when agentOptions provided', () => {
    render(
      <AuditLogFilters
        value={baseState}
        onChange={() => {}}
        agentOptions={['coverage-expansion', 'source-onboarder']}
      />,
    );
    const control = screen.getByTestId('audit-log-filter-agent');
    expect(control.tagName).toBe('SELECT');
    expect(screen.getByText('coverage-expansion')).toBeInTheDocument();
  });

  it('renders agent control as a text input when no options known', () => {
    render(<AuditLogFilters value={baseState} onChange={() => {}} />);
    const control = screen.getByTestId('audit-log-filter-agent');
    expect(control.tagName).toBe('INPUT');
  });
});
