import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DefinePain } from './DefinePain';

describe('<DefinePain />', () => {
  it('disables the LET ARCHITECT DESIGN IT button when input is empty', () => {
    const onSubmit = vi.fn();
    render(<DefinePain onSubmit={onSubmit} />);
    const button = screen.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enables the button and submits trimmed input when text is entered', () => {
    const onSubmit = vi.fn();
    render(<DefinePain onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   public adjusters tracking storm damage   ' } });
    const button = screen.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith('public adjusters tracking storm damage');
  });

  it('does not fall back to the placeholder when input is whitespace only', () => {
    const onSubmit = vi.fn();
    render(<DefinePain onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } });
    const button = screen.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
