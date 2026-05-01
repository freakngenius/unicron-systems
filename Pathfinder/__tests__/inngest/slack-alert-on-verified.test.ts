// Unit tests for the slack-alert-on-verified Inngest function — G1 Task B6.
//
// Mocks @/lib/supabase + @/lib/slack/alerts so the function body can be
// exercised without touching the DB or Slack. The test asserts the gating
// logic: below-threshold → no DB load, no alert; above-threshold + fresh
// project → alert; above-threshold + stale project → no alert.

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockProjectQuery = vi.fn();
const mockRunSlackAlertsForProject = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockProjectQuery(),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/slack/alerts', () => ({
  runSlackAlertsForProject: (...args: unknown[]) => mockRunSlackAlertsForProject(...args),
}));

import { slackAlertOnVerifiedHandler } from '@/lib/inngest/functions/slack-alert-on-verified';

// Pass-through `step` shim — runs the inner function inline rather than
// queueing it through Inngest's step machinery. The function body still
// gets exercised; only the durability layer is bypassed.
const passthroughStep = {
  run: async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn(),
};

describe('slackAlertOnVerified', () => {
  afterEach(() => {
    mockProjectQuery.mockReset();
    mockRunSlackAlertsForProject.mockReset();
  });

  it('skips below-threshold projects without loading the DB', async () => {
    const result = (await slackAlertOnVerifiedHandler(
      {
        data: {
          project_id: 'p-1',
          score: 75,
          verifier_pass_count: 1,
          verified_at: '2026-05-01T00:00:00Z',
        },
      },
      passthroughStep,
    ))as { skipped: string };

    expect(result.skipped).toBe('below_threshold');
    expect(mockProjectQuery).not.toHaveBeenCalled();
    expect(mockRunSlackAlertsForProject).not.toHaveBeenCalled();
  });

  it('skips stale projects (posted_date older than 60 days)', async () => {
    const eightyDaysAgo = new Date(Date.now() - 80 * 24 * 3600 * 1000).toISOString();
    mockProjectQuery.mockResolvedValueOnce({
      data: {
        id: 'p-2',
        posted_date: eightyDaysAgo,
        nearest_branch_id: 'b-1',
      },
      error: null,
    });

    const result = (await slackAlertOnVerifiedHandler(
      {
        data: {
          project_id: 'p-2',
          score: 95,
          verifier_pass_count: 1,
          verified_at: '2026-05-01T00:00:00Z',
        },
      },
      passthroughStep,
    ))as { skipped?: string };

    expect(result.skipped).toBe('stale');
    expect(mockRunSlackAlertsForProject).not.toHaveBeenCalled();
  });

  it('dispatches alert for high-priority fresh project', async () => {
    const freshDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
    const project = {
      id: 'p-3',
      posted_date: freshDate,
      nearest_branch_id: 'b-1',
      score: 95,
    };
    mockProjectQuery.mockResolvedValueOnce({ data: project, error: null });
    mockRunSlackAlertsForProject.mockResolvedValueOnce({ outcome: 'posted' });

    const result = (await slackAlertOnVerifiedHandler(
      {
        data: {
          project_id: 'p-3',
          score: 95,
          verifier_pass_count: 1,
          verified_at: '2026-05-01T00:00:00Z',
        },
      },
      passthroughStep,
    ))as { outcome?: string; project_id?: string };

    expect(result.outcome).toBe('posted');
    expect(result.project_id).toBe('p-3');
    expect(mockRunSlackAlertsForProject).toHaveBeenCalledWith(project);
  });

  it('throws when project lookup fails (Inngest will retry)', async () => {
    mockProjectQuery.mockResolvedValueOnce({
      data: null,
      error: { message: 'transient supabase failure' },
    });

    await expect(
      slackAlertOnVerifiedHandler(
        {
          data: {
            project_id: 'p-missing',
            score: 95,
            verifier_pass_count: 1,
            verified_at: '2026-05-01T00:00:00Z',
          },
        },
        passthroughStep,
      ),
    ).rejects.toThrow(/load project p-missing/);
    expect(mockRunSlackAlertsForProject).not.toHaveBeenCalled();
  });
});
