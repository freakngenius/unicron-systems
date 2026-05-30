// __tests__/catalog/modules/daily-digest.test.ts, Stream D.
//
// Unit tests for the daily-digest module runner. Asserts:
//   - Hard gate: returns { skipped: 'no_slack_integration' } when Slack
//     webhook is absent; does not post, does not seed.
//   - Hard gate: returns { skipped: 'no_verified_companies' } when zero
//     verified projects in the window; does not post, does not seed.
//   - When both gates pass: composes via composeInternalDigest, posts via
//     the injected slackPoster, and seeds deals at pipeline_stage='NEW'
//     (which equals INTERNAL_TO_DEAL['new-outreach-ready']).
//   - Existing-deal dedupe: only fresh project ids get seeded.
//   - Top-N selection passes through to the existing composer.

import { describe, it, expect, vi } from 'vitest';
import { runInternalDailyDigest } from '@/lib/catalog/modules/daily-digest/runner';
import { INTERNAL_TO_DEAL } from '@/lib/catalog/modules/pipeline-kanban/internalStageMap';

interface FakeProject {
  id: string;
  title: string;
  score: number;
  verified: boolean;
  ranked_at: string;
  organization_id: string;
  raw_payload?: Record<string, unknown>;
  source?: string | null;
  source_id?: string | null;
  outreach_hook?: string | null;
}

function project(overrides: Partial<FakeProject> & { id: string }): FakeProject {
  const base: FakeProject = {
    id: overrides.id,
    title: 'Acme Site Services',
    score: 80,
    verified: true,
    ranked_at: new Date().toISOString(),
    organization_id: 'org-internal',
    raw_payload: {
      internal_enrichment: { service_category: 'temp-fence' },
      internal_geo: { hq_state: 'TX', operating_states: ['TX'] },
    },
    source: 'sam-gov',
    source_id: overrides.id,
    outreach_hook: null,
  };
  return { ...base, ...overrides };
}

interface FakeState {
  orgRow: { id: string; slug: string; name: string; architecture: { branding?: { display_name?: string } } } | null;
  projects: FakeProject[];
  existingDealProjectIds: string[];
  insertedRows: Array<Record<string, unknown>>;
  insertError: string | null;
}

function makeFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'organizations') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: state.orgRow }),
                };
              },
            };
          },
        };
      }
      if (table === 'projects') {
        return {
          select() {
            const chain = {
              eq() { return chain; },
              gte() { return chain; },
              order() { return chain; },
              limit: async () => ({ data: state.projects }),
            };
            return chain;
          },
        };
      }
      if (table === 'deals') {
        return {
          select() {
            return {
              in: async () => ({
                data: state.existingDealProjectIds.map((id) => ({ project_id: id })),
                error: null,
              }),
            };
          },
          insert: async (rows: Array<Record<string, unknown>>) => {
            if (state.insertError) return { error: { message: state.insertError } };
            state.insertedRows.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function baseOrgRow() {
  return {
    id: 'org-internal',
    slug: 'internal',
    name: 'Unicron Internal',
    architecture: { branding: { display_name: 'Unicron Internal' } },
  };
}

describe('runInternalDailyDigest hard gates', () => {
  it('skips when INTERNAL_SLACK_WEBHOOK_URL is unset (integration/slack hard gate)', async () => {
    const state: FakeState = {
      orgRow: baseOrgRow(),
      projects: [project({ id: 'p1' })],
      existingDealProjectIds: [],
      insertedRows: [],
      insertError: null,
    };
    const slackPoster = vi.fn();
    const res = await runInternalDailyDigest({
      slackWebhookUrl: null,
      supabaseClient: makeFakeSupabase(state) as never,
      slackPoster,
    });
    expect(res.slack_result).toEqual({ skipped: 'no_slack_integration' });
    expect(res.kanban_result).toMatchObject({ skipped: 'no_slack_integration' });
    expect(state.insertedRows).toHaveLength(0);
    expect(slackPoster).not.toHaveBeenCalled();
  });

  it('skips when no verified companies in window (data_signal/verified_companies hard gate)', async () => {
    const state: FakeState = {
      orgRow: baseOrgRow(),
      projects: [],
      existingDealProjectIds: [],
      insertedRows: [],
      insertError: null,
    };
    const slackPoster = vi.fn();
    const res = await runInternalDailyDigest({
      slackWebhookUrl: 'https://hooks.slack.test/webhook',
      supabaseClient: makeFakeSupabase(state) as never,
      slackPoster,
    });
    expect(res.slack_result).toEqual({ skipped: 'no_verified_companies' });
    expect(res.kanban_result).toMatchObject({ skipped: 'no_verified_companies' });
    expect(state.insertedRows).toHaveLength(0);
    expect(slackPoster).not.toHaveBeenCalled();
  });
});

describe('runInternalDailyDigest delivery path', () => {
  it('composes, posts, and seeds dealsAtNewOutreachReady when both gates pass', async () => {
    const state: FakeState = {
      orgRow: baseOrgRow(),
      projects: [
        project({ id: 'p1', score: 90 }),
        project({ id: 'p2', score: 70 }),
        project({ id: 'p3', score: 60 }),
      ],
      existingDealProjectIds: ['p2'],
      insertedRows: [],
      insertError: null,
    };
    const slackPoster = vi.fn(async () => ({ ok: true }));
    const res = await runInternalDailyDigest({
      slackWebhookUrl: 'https://hooks.slack.test/webhook',
      supabaseClient: makeFakeSupabase(state) as never,
      slackPoster,
    });
    expect(res.slack_result).toEqual({ ok: true });
    expect(res.digest).not.toBeNull();
    // composeInternalDigest sorts by score desc; assert the order surfaced.
    expect(res.digest!.entries.map((e) => e.project_id)).toEqual(['p1', 'p2', 'p3']);

    // The new-verified loader should target the new-outreach-ready stage,
    // i.e. the deal-pipeline-stage = NEW = INTERNAL_TO_DEAL['new-outreach-ready'].
    expect(state.insertedRows).toHaveLength(2); // p1 + p3, p2 already exists
    for (const row of state.insertedRows) {
      expect(row.pipeline_stage).toBe(INTERNAL_TO_DEAL['new-outreach-ready']);
    }
    const seededIds = state.insertedRows.map((r) => r.project_id);
    expect(seededIds.sort()).toEqual(['p1', 'p3']);

    expect(slackPoster).toHaveBeenCalledTimes(1);
    const firstCallArgs = slackPoster.mock.calls[0] as unknown[];
    expect(firstCallArgs[0]).toBe('https://hooks.slack.test/webhook');
  });

  it('respects topN when selecting digest entries', async () => {
    const state: FakeState = {
      orgRow: baseOrgRow(),
      projects: [
        project({ id: 'p1', score: 95 }),
        project({ id: 'p2', score: 90 }),
        project({ id: 'p3', score: 85 }),
        project({ id: 'p4', score: 80 }),
      ],
      existingDealProjectIds: [],
      insertedRows: [],
      insertError: null,
    };
    const res = await runInternalDailyDigest({
      slackWebhookUrl: 'https://hooks.slack.test/webhook',
      supabaseClient: makeFakeSupabase(state) as never,
      slackPoster: async () => ({ ok: true }),
      topN: 2,
    });
    expect(res.digest!.entries).toHaveLength(2);
    expect(res.digest!.entries.map((e) => e.project_id)).toEqual(['p1', 'p2']);
  });

  it('dryRun composes but does not post or insert', async () => {
    const state: FakeState = {
      orgRow: baseOrgRow(),
      projects: [project({ id: 'p1' })],
      existingDealProjectIds: [],
      insertedRows: [],
      insertError: null,
    };
    const slackPoster = vi.fn();
    const res = await runInternalDailyDigest({
      slackWebhookUrl: 'https://hooks.slack.test/webhook',
      supabaseClient: makeFakeSupabase(state) as never,
      slackPoster,
      dryRun: true,
    });
    expect(res.slack_result).toEqual({ skipped: 'dry_run' });
    expect(res.kanban_result).toMatchObject({ skipped: 'dry_run' });
    expect(slackPoster).not.toHaveBeenCalled();
    expect(state.insertedRows).toHaveLength(0);
  });
});

describe('runInternalDailyDigest org guard', () => {
  it('throws when the org slug does not resolve so the cron never posts for the wrong org', async () => {
    const state: FakeState = {
      orgRow: null,
      projects: [],
      existingDealProjectIds: [],
      insertedRows: [],
      insertError: null,
    };
    await expect(
      runInternalDailyDigest({
        slackWebhookUrl: 'https://hooks.slack.test/webhook',
        supabaseClient: makeFakeSupabase(state) as never,
        slackPoster: async () => ({ ok: true }),
      }),
    ).rejects.toThrow(/org .* not found/);
  });
});
