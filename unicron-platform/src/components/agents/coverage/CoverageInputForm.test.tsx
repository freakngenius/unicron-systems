import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CoverageInputForm, toScopeConstraints } from './CoverageInputForm';

describe('CoverageInputForm', () => {
  it('blocks submission until goal text + at least one metro are provided', async () => {
    const onSubmit = vi.fn();
    render(<CoverageInputForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('coverage-dispatch-button'));
    expect(await screen.findByTestId('coverage-form-error')).toHaveTextContent(
      /Goal text/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks submission when goal text is set but no metro chip is added', async () => {
    const onSubmit = vi.fn();
    render(<CoverageInputForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('coverage-goal-text'), {
      target: { value: 'Expand Pittsburgh metro coverage' },
    });
    fireEvent.click(screen.getByTestId('coverage-dispatch-button'));
    expect(await screen.findByTestId('coverage-form-error')).toHaveTextContent(
      /at least one metro/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('adds metros + keywords as chips on Enter', async () => {
    const onSubmit = vi.fn();
    render(<CoverageInputForm onSubmit={onSubmit} />);

    const metroInput = screen.getByTestId('coverage-metro-input');
    fireEvent.change(metroInput, { target: { value: 'Pittsburgh, PA' } });
    fireEvent.keyDown(metroInput, { key: 'Enter' });

    expect(screen.getByTestId('coverage-metro-chip')).toHaveTextContent(/Pittsburgh, PA/);

    const kwInput = screen.getByTestId('coverage-keyword-input');
    fireEvent.change(kwInput, { target: { value: 'security' } });
    fireEvent.keyDown(kwInput, { key: 'Enter' });
    expect(screen.getAllByTestId('coverage-keyword-chip')[0]).toHaveTextContent(/security/);
  });

  it('submits the full structured payload on a valid run', async () => {
    const onSubmit = vi.fn();
    render(<CoverageInputForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('coverage-goal-text'), {
      target: { value: 'Pittsburgh expansion target 50 leads' },
    });
    const metroInput = screen.getByTestId('coverage-metro-input');
    fireEvent.change(metroInput, { target: { value: 'Pittsburgh, PA' } });
    fireEvent.keyDown(metroInput, { key: 'Enter' });

    fireEvent.change(screen.getByTestId('coverage-target-lead-count'), {
      target: { value: '60' },
    });
    fireEvent.change(screen.getByTestId('coverage-radius'), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByTestId('coverage-lookback'), {
      target: { value: '60' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('coverage-dispatch-button'));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0];
    expect(values).toMatchObject({
      vertical_id: 'pathfinder-default',
      goal_text: 'Pittsburgh expansion target 50 leads',
      metros: ['Pittsburgh, PA'],
      target_lead_count: 60,
      radius_miles: 40,
      lookback_days: 60,
    });
  });

  it('toScopeConstraints maps form values to wire shape', () => {
    const scope = toScopeConstraints({
      vertical_id: 'pathfinder-default',
      goal_text: 'g',
      metros: ['Pittsburgh, PA'],
      radius_miles: 25,
      target_lead_count: 50,
      signal_keywords: ['security'],
      lookback_days: 30,
      budget_usd: null,
    });
    expect(scope.geography).toEqual(['Pittsburgh, PA']);
    expect(scope.signal_keywords).toEqual(['security']);
    expect(scope.lookback_days).toBe(30);
    expect(scope.target_lead_count).toBe(50);
  });
});
