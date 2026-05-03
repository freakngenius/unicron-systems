// Unit tests for the per-user iterator (services/briefer/cron.ts) +
// the shouldSkip pure decision. Mocks listUsers / loadPrefs / compose /
// send via dependency injection so the test stays in-memory.

import { describe, expect, it, vi } from 'vitest';

import {
  __test__ as cronTest,
  runDailyBriefingForAllUsers,
  shouldSkip,
} from '@/services/briefer/cron';
import { DEFAULT_BRIEFING_PREFS, type BriefingPrefs, type DailyBrief } from '@/lib/types';

const NOW_2026_05_04_14_UTC = new Date('2026-05-04T14:00:00Z'); // 07:00 PT, Monday

function prefs(over: Partial<BriefingPrefs> = {}): BriefingPrefs {
  return {
    user_id: 'kyle@freakngenius.com',
    ...DEFAULT_BRIEFING_PREFS,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function emptyBrief(): DailyBrief {
  return {
    subject: 'subj',
    markdown: 'md',
    html: 'html',
    metrics: {
      new_leads_count: 0,
      follow_ups_count: 0,
      stage_changes_count: 0,
      replies_count: 0,
      contacts_pending_count: 0,
      llm_cost_usd: 0,
    },
    sections_rendered: [],
  };
}

describe('shouldSkip — pure decision', () => {
  it('honors paused flag', () => {
    expect(shouldSkip(prefs({ paused: true }), NOW_2026_05_04_14_UTC)).toBe('paused');
  });

  it('honors frequency=paused even when paused flag false', () => {
    expect(
      shouldSkip(prefs({ paused: false, frequency: 'paused' }), NOW_2026_05_04_14_UTC),
    ).toBe('frequency_paused');
  });

  it('weekly cadence skips when local weekday != Monday', () => {
    // 2026-05-06 14:00 UTC = 2026-05-06 07:00 PT, Wednesday.
    const wed = new Date('2026-05-06T14:00:00Z');
    expect(
      shouldSkip(prefs({ frequency: 'weekly' }), wed),
    ).toBe('wrong_day_for_weekly');
  });

  it('weekly cadence allows when local weekday is Monday', () => {
    expect(
      shouldSkip(prefs({ frequency: 'weekly' }), NOW_2026_05_04_14_UTC),
    ).toBeNull();
  });

  it('skips when local hour != send_hour', () => {
    expect(
      shouldSkip(prefs({ send_hour: 8 }), NOW_2026_05_04_14_UTC),
    ).toBe('wrong_local_hour');
  });

  it('returns null when daily, not paused, and local hour matches', () => {
    expect(shouldSkip(prefs(), NOW_2026_05_04_14_UTC)).toBeNull();
  });

  it('honors a non-default timezone (DST-aware)', () => {
    // 2026-05-04 14:00 UTC = 2026-05-04 10:00 EDT (May is in DST = UTC-4).
    expect(
      shouldSkip(prefs({ timezone: 'America/New_York', send_hour: 10 }), NOW_2026_05_04_14_UTC),
    ).toBeNull();
    expect(
      shouldSkip(prefs({ timezone: 'America/New_York', send_hour: 7 }), NOW_2026_05_04_14_UTC),
    ).toBe('wrong_local_hour');
  });
});

describe('hourInTz / isoWeekdayInTz helpers', () => {
  it('hourInTz returns local hour 0-23', () => {
    expect(cronTest.hourInTz(NOW_2026_05_04_14_UTC, 'America/Los_Angeles')).toBe(7);
    expect(cronTest.hourInTz(NOW_2026_05_04_14_UTC, 'UTC')).toBe(14);
    expect(cronTest.hourInTz(NOW_2026_05_04_14_UTC, 'Asia/Tokyo')).toBe(23);
  });

  it('isoWeekdayInTz returns 1-7 (Mon-Sun)', () => {
    expect(cronTest.isoWeekdayInTz(NOW_2026_05_04_14_UTC, 'America/Los_Angeles')).toBe(1);
    // 2026-05-09 14:00 UTC = Saturday in PT.
    expect(
      cronTest.isoWeekdayInTz(new Date('2026-05-09T14:00:00Z'), 'America/Los_Angeles'),
    ).toBe(6);
  });
});

describe('runDailyBriefingForAllUsers — orchestration', () => {
  it('counts sent / skipped / failed and isolates per-user errors', async () => {
    const users = ['user-a@x.com', 'user-b@x.com', 'user-c@x.com', 'user-d@x.com'];
    const composeImpl = vi.fn(async () => emptyBrief());
    const sendImpl = vi.fn(async ({ userId }: { userId: string }) => {
      if (userId === 'user-c@x.com') {
        return {
          ok: false,
          message_id: null,
          error: 'gmail_500',
          outreach_send_id: null,
          provider: 'gmail' as const,
        };
      }
      if (userId === 'user-d@x.com') {
        return {
          ok: false,
          message_id: null,
          error: 'no_active_integration',
          outreach_send_id: null,
          provider: null,
        };
      }
      return {
        ok: true,
        message_id: `m-${userId}`,
        error: null,
        outreach_send_id: `r-${userId}`,
        provider: 'gmail' as const,
      };
    });

    const result = await runDailyBriefingForAllUsers({
      now: NOW_2026_05_04_14_UTC,
      listUsers: async () => users,
      loadPrefsImpl: async (userId) => prefs({ user_id: userId }),
      composeImpl,
      sendImpl,
    });

    expect(result.users_considered).toBe(4);
    expect(result.sent).toBe(2); // a, b
    expect(result.failed).toBe(1); // c
    expect(result.skipped).toBe(1); // d (no_active_integration counted as skip)
    expect(result.skip_reasons.no_active_integration).toBe(1);
    expect(result.errors).toEqual([
      { user_id: 'user-c@x.com', error: 'gmail_500' },
    ]);
    // compose ran for all 4 not-pre-filtered users.
    expect(composeImpl).toHaveBeenCalledTimes(4);
  });

  it('skips users whose prefs gate them out (paused, off-hour) without composing', async () => {
    const composeImpl = vi.fn(async () => emptyBrief());
    const sendImpl = vi.fn(async () => ({
      ok: true,
      message_id: 'm',
      error: null,
      outreach_send_id: 'r',
      provider: 'gmail' as const,
    }));
    const result = await runDailyBriefingForAllUsers({
      now: NOW_2026_05_04_14_UTC,
      listUsers: async () => ['paused@x.com', 'offhour@x.com', 'ok@x.com'],
      loadPrefsImpl: async (userId) => {
        if (userId === 'paused@x.com') return prefs({ user_id: userId, paused: true });
        if (userId === 'offhour@x.com') return prefs({ user_id: userId, send_hour: 8 });
        return prefs({ user_id: userId });
      },
      composeImpl,
      sendImpl,
    });
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.skip_reasons.paused).toBe(1);
    expect(result.skip_reasons.wrong_local_hour).toBe(1);
    // compose only ran for the one user who passed the gate.
    expect(composeImpl).toHaveBeenCalledTimes(1);
    expect(sendImpl).toHaveBeenCalledTimes(1);
  });

  it('counts loadPrefs failures as failed and continues the loop', async () => {
    const sendImpl = vi.fn(async () => ({
      ok: true,
      message_id: 'm',
      error: null,
      outreach_send_id: 'r',
      provider: 'gmail' as const,
    }));
    const result = await runDailyBriefingForAllUsers({
      now: NOW_2026_05_04_14_UTC,
      listUsers: async () => ['bad@x.com', 'good@x.com'],
      loadPrefsImpl: async (userId) => {
        if (userId === 'bad@x.com') throw new Error('db_unreachable');
        return prefs({ user_id: userId });
      },
      composeImpl: async () => emptyBrief(),
      sendImpl,
    });
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.errors[0]).toEqual({
      user_id: 'bad@x.com',
      error: 'db_unreachable',
    });
  });
});
