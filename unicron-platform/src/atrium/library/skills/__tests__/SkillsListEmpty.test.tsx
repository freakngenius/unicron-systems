import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillsListEmpty } from '../SkillsListEmpty';

describe('SkillsListEmpty', () => {
  it('renders three skeleton bars in loading mode', () => {
    render(<SkillsListEmpty mode="loading" />);
    const wrap = screen.getByTestId('skills-list-empty-loading');
    expect(wrap).toBeInTheDocument();
    expect(wrap.querySelectorAll('div.animate-pulse').length).toBe(3);
  });

  it('renders the default empty headline when no message is passed', () => {
    render(<SkillsListEmpty mode="empty" />);
    expect(
      screen.getByText('No Skills match the current filter.'),
    ).toBeInTheDocument();
  });

  it('renders custom message and hint in empty mode', () => {
    render(
      <SkillsListEmpty mode="empty" message="None found" hint="Widen the filter." />,
    );
    expect(screen.getByText('None found')).toBeInTheDocument();
    expect(screen.getByText('Widen the filter.')).toBeInTheDocument();
  });

  it('renders an alert role with the error message', () => {
    render(<SkillsListEmpty mode="error" message="boom" hint="see logs" />);
    const node = screen.getByRole('alert');
    expect(node).toHaveTextContent('boom');
    expect(node).toHaveTextContent('see logs');
  });
});
