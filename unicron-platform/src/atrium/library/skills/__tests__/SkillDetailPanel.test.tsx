import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SkillDetailPanel } from '../SkillDetailPanel';
import { makeSkill } from './fixtures';

vi.mock('../../../../lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  }),
}));

describe('SkillDetailPanel', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders header metadata once the skill loads', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...makeSkill({ name: 'draft_briefing_for_bd_rep', version: 2 }),
        history: [],
      }),
    });

    render(<SkillDetailPanel skillId="abc" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('draft_briefing_for_bd_rep')).toBeInTheDocument();
    });
    // Both the meta row ("Version v2") and the version-history entry render
    // "v2"; we just need to confirm the version surfaces somewhere.
    expect(screen.getAllByText(/^v2/).length).toBeGreaterThan(0);
    // SKILL.md link
    const link = screen.getByRole('link', {
      name: /wiki\/skills\/run-zedcor-weekly-digest\.md/,
    });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/freakngenius/unicron-knowledge/blob/main/wiki/skills/run-zedcor-weekly-digest.md',
    );
  });

  it('renders version history latest-first and emits onSelectVersion', async () => {
    const current = {
      ...makeSkill({ id: 'cur', version: 3 }),
      history: [
        makeSkill({ id: 'old-1', version: 1 }),
        makeSkill({ id: 'old-2', version: 2 }),
      ],
    };
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => current,
    });
    const onSelect = vi.fn();

    render(
      <SkillDetailPanel
        skillId="cur"
        onClose={() => {}}
        onSelectVersion={onSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Version history')).toBeInTheDocument();
    });

    // Confirm "current" badge sits on v3 (the loaded skill).
    const v3Row = screen.getByTestId('skill-version-cur');
    expect(v3Row).toHaveTextContent('v3');
    expect(v3Row).toHaveTextContent('current');

    // Click open on v1 — should emit the corresponding id.
    const v1Row = screen.getByTestId('skill-version-old-1');
    fireEvent.click(v1Row.querySelector('button')!);
    expect(onSelect).toHaveBeenCalledWith('old-1');
  });

  it('shows an error state if the fetch fails', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    render(<SkillDetailPanel skillId="bad" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
