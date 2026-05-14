import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillCard } from '../SkillCard';
import { makeSkill } from './fixtures';

describe('SkillCard', () => {
  it('renders name, version badge, run/success counts, and decay label', () => {
    const skill = makeSkill({
      name: 'run_zedcor_weekly_digest',
      version: 3,
      run_count: 10,
      success_count: 8,
      decay_at: new Date(Date.now() + 86_400_000 * 30).toISOString(),
    });
    render(<SkillCard skill={skill} />);
    expect(screen.getByText('run_zedcor_weekly_digest')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText(/10 runs/)).toBeInTheDocument();
    expect(screen.getByText(/80%/)).toBeInTheDocument();
    // The relative-time helper rounds down, so allow any "in Nd" within a
    // few days of the 30d target. We just want to confirm the chip rendered.
    expect(screen.getByText(/decays in \d+d/)).toBeInTheDocument();
  });

  it('shows the gated chip when refusal_gate is true', () => {
    render(<SkillCard skill={makeSkill({ refusal_gate: true })} />);
    expect(screen.getByText('gated')).toBeInTheDocument();
  });

  it('shows the tenant chip when customer_id is set', () => {
    render(<SkillCard skill={makeSkill({ customer_id: 'cust-uuid' })} />);
    expect(screen.getByText('tenant')).toBeInTheDocument();
  });

  it('renders the lifecycle status pill', () => {
    render(<SkillCard skill={makeSkill({ lifecycle_status: 'retired' })} />);
    expect(screen.getByText('retired')).toBeInTheDocument();
  });

  it('fires onSelect with the skill on click when interactive', () => {
    const onSelect = vi.fn();
    const skill = makeSkill();
    render(<SkillCard skill={skill} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId(`skill-card-${skill.id}`));
    expect(onSelect).toHaveBeenCalledWith(skill);
  });

  it('renders an action node when provided', () => {
    render(
      <SkillCard
        skill={makeSkill()}
        action={<span data-testid="custom-action">go</span>}
      />,
    );
    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
  });

  it('uses author_kind glyph in the leading badge', () => {
    render(<SkillCard skill={makeSkill({ author_kind: 'skill_forge' })} />);
    // "F" for Skill Forge per authorKindGlyph
    const badge = screen.getByLabelText(/Authored by Skill Forge/i);
    expect(badge).toHaveTextContent('F');
  });
});
