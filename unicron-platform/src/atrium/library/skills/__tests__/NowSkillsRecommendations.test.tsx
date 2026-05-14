import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { NowSkillsRecommendations } from '../NowSkillsRecommendations';
import { makeSearchResult } from './fixtures';

// Stub Supabase: rpc returns context inputs; from() unused.
function makeStubClient(rpcResults: Record<string, unknown[]>) {
  return {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    rpc: (name: string) =>
      Promise.resolve({ data: rpcResults[name] ?? [], error: null }),
  };
}

vi.mock('../../../../lib/supabase', () => ({
  getSupabase: () =>
    makeStubClient({
      ns_top_of_mind_for_dri: [
        { title: 'Brief Pathfinder on Northwind' },
        { title: 'Follow up with Zedcor procurement' },
      ],
      ns_list_skill_runs: [{ content_summary: 'Weekly digest fired' }],
      ns_list_customers: [{ name: 'Zedcor' }, { name: 'Northwind' }],
    }),
}));

describe('NowSkillsRecommendations snapshots', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function renderWithResults(count: 0 | 1 | 3) {
    const results = Array.from({ length: count }).map((_, i) =>
      makeSearchResult(
        { id: `s${i}`, name: `seeded_skill_${i}` },
        0.9 - i * 0.05,
      ),
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ query: 'snapshot', results }),
    });

    const { container } = render(
      <NowSkillsRecommendations teamMemberId="dri-1" />,
    );

    // Wait for the search call to settle: the count badge flips to a number.
    await waitFor(() =>
      expect(
        screen.getByTestId('now-skills-recommendations'),
      ).toHaveTextContent(`${count} / 3`),
    );
    return container.querySelector('[data-testid="now-skills-recommendations"]');
  }

  it('renders the 0-result empty state', async () => {
    const node = await renderWithResults(0);
    expect(node).toMatchSnapshot();
  });

  it('renders a single-result card', async () => {
    const node = await renderWithResults(1);
    expect(node).toMatchSnapshot();
  });

  it('renders three-result cards', async () => {
    const node = await renderWithResults(3);
    expect(node).toMatchSnapshot();
  });
});
