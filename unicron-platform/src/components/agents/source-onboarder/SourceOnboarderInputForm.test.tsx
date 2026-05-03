import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  SourceOnboarderInputForm,
  toOnboardRequest,
} from './SourceOnboarderInputForm';

describe('SourceOnboarderInputForm', () => {
  it('blocks submission when both URL and description are empty', async () => {
    const onSubmit = vi.fn();
    render(<SourceOnboarderInputForm onSubmit={onSubmit} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('source-onboarder-dispatch-button'));
    });
    expect(screen.getByTestId('source-onboarder-form-error')).toHaveTextContent(
      /at least one of URL or description/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the structured payload with URL + hint + jurisdiction', async () => {
    const onSubmit = vi.fn();
    render(<SourceOnboarderInputForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('source-onboarder-url'), {
      target: { value: 'https://data.alleghenycounty.us/permits' },
    });
    fireEvent.change(screen.getByTestId('source-onboarder-hint'), {
      target: { value: 'socrata' },
    });
    fireEvent.change(screen.getByTestId('source-onboarder-jurisdiction'), {
      target: { value: 'Allegheny County, PA' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('source-onboarder-dispatch-button'));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      url: 'https://data.alleghenycounty.us/permits',
      hint: 'socrata',
      jurisdiction: 'Allegheny County, PA',
      test_only: false,
    });
  });

  it('toOnboardRequest drops empty fields and trims values', () => {
    const req = toOnboardRequest({
      url: '  https://x.test  ',
      description: '',
      hint: 'rest',
      jurisdiction: '',
      api_key_env: '  TOKEN_ENV  ',
      test_only: true,
    });
    expect(req).toEqual({
      url: 'https://x.test',
      hint: 'rest',
      api_key_env: 'TOKEN_ENV',
    });
  });
});
