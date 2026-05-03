import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorStatusBadge } from '../ConnectorStatusBadge';
import { toneFor as __toneFor } from '../statusTone';
import { CONNECTOR_STATUSES_HEALTH } from '../../../lib/contracts/connectorsHealth';

describe('ConnectorStatusBadge color mapping', () => {
  it('active uses emerald (green)', () => {
    expect(__toneFor('active')).toMatch(/emerald/);
  });
  it('expired uses accent-gold (amber)', () => {
    expect(__toneFor('expired')).toMatch(/accent-gold/);
  });
  it('error uses rose (red)', () => {
    expect(__toneFor('error')).toMatch(/rose/);
  });
  it('unknown uses neutral text-primary tone', () => {
    expect(__toneFor('unknown')).toMatch(/text-primary/);
  });
  it('every canonical status has a tone (no UI crash on a new status)', () => {
    for (const s of CONNECTOR_STATUSES_HEALTH) {
      expect(__toneFor(s)).toBeTruthy();
    }
  });

  it('renders the status label and a data-status attribute the dashboard can target', () => {
    render(<ConnectorStatusBadge status="active" />);
    const badge = screen.getByTestId('connector-status-badge');
    expect(badge).toHaveAttribute('data-status', 'active');
    expect(badge.textContent).toBe('active');
  });
});
