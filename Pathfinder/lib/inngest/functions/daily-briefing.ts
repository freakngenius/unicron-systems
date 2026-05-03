// lib/inngest/functions/daily-briefing.ts — Demo Polish UX Gate 13W-B.
//
// Daily intelligence loop cron. Runs hourly so each user's
// briefing_prefs.send_hour + timezone are honored — without that, a
// 7am-UTC cron would land Kyle's brief at midnight PT. The prompt
// allows "one cron that iterates users" as the alternative to
// "0 7 * * * per user"; this is the iterating variant.
//
// Stubbed behind BRIEFING_CRON_ENABLED=1. Until 13W-D verification is
// signed off, the cron returns immediately without composing or sending
// anything. Production env keeps it off until Kyle sets the var.

import { inngest } from '../client';

interface DailyBriefingRunResult {
  enabled: boolean;
  users_considered: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: Array<{ user_id: string; error: string }>;
  // Why each user was skipped — populated only when paused, off-hour,
  // wrong day, or no_active_integration. Useful for cron-output
  // sanity checks.
  skip_reasons: Record<string, number>;
}

export const dailyBriefingCron = inngest.createFunction(
  {
    id: 'pathfinder-daily-briefing-cron',
    name: 'Daily intelligence brief — hourly per-user dispatch',
    retries: 1,
    triggers: [{ cron: 'TZ=UTC 0 * * * *' }],
  },
  async ({ step }: { step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    return stepCtx.run('iterate-and-send', async () => {
      if (process.env.BRIEFING_CRON_ENABLED !== '1') {
        return {
          enabled: false,
          users_considered: 0,
          sent: 0,
          skipped: 0,
          failed: 0,
          errors: [],
          skip_reasons: {},
        } satisfies DailyBriefingRunResult;
      }
      const { runDailyBriefingForAllUsers } = await import(
        '@/services/briefer/cron'
      );
      return runDailyBriefingForAllUsers({ now: new Date() });
    });
  },
);
