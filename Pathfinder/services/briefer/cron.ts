// services/briefer/cron.ts — Demo Polish UX Gate 13W-B.
//
// Per-user iterator. The Inngest function in
// lib/inngest/functions/daily-briefing.ts wraps this with the
// BRIEFING_CRON_ENABLED gate and the cron-step handle. Tests target
// this module directly with stubbed listUsers/loadPrefs/compose/send
// adapters — the cron file is too thin to be worth its own test
// surface.

import { supabaseAdmin } from '@/lib/supabase';
import type { BriefingPrefs, DailyBrief } from '@/lib/types';

import { composeDailyBrief, loadPrefs } from './agent';
import { sendDailyBrief, type SendDailyBriefResult } from './send';

export type SkipReason =
  | 'paused'
  | 'frequency_paused'
  | 'wrong_day_for_weekly'
  | 'wrong_local_hour'
  | 'no_active_integration';

export interface RunDailyBriefingResult {
  enabled: boolean;
  users_considered: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: Array<{ user_id: string; error: string }>;
  skip_reasons: Record<SkipReason, number>;
}

export interface RunDailyBriefingInput {
  now: Date;
  // Test seams — defaults wire to the live Supabase + service modules.
  db?: { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  listUsers?: () => Promise<string[]>;
  loadPrefsImpl?: (userId: string) => Promise<BriefingPrefs>;
  composeImpl?: (input: {
    userId: string;
    now: Date;
    prefs: BriefingPrefs;
  }) => Promise<DailyBrief>;
  sendImpl?: (input: { userId: string; brief: DailyBrief }) => Promise<SendDailyBriefResult>;
  // Override "today is Monday" semantics for weekly cadence (default
  // ISO weekday 1 = Monday).
  weeklyDay?: number;
}

export async function runDailyBriefingForAllUsers(
  input: RunDailyBriefingInput,
): Promise<RunDailyBriefingResult> {
  const result: RunDailyBriefingResult = {
    enabled: true,
    users_considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    skip_reasons: {
      paused: 0,
      frequency_paused: 0,
      wrong_day_for_weekly: 0,
      wrong_local_hour: 0,
      no_active_integration: 0,
    },
  };

  // Lazy DB resolution — supabaseAdmin() throws when env vars are
  // missing, so only resolve it when a default impl actually needs it.
  // Tests that stub every impl + listUsers can omit `db` entirely.
  const dbThunk = (): { from: (t: string) => any } => // eslint-disable-line @typescript-eslint/no-explicit-any
    input.db ?? (supabaseAdmin() as unknown as { from: (t: string) => any }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const listUsers = input.listUsers ?? (() => listConnectedUsers(dbThunk()));
  const loadPrefsFn =
    input.loadPrefsImpl ?? ((userId: string) => loadPrefs(dbThunk(), userId));
  const compose =
    input.composeImpl ??
    ((args: { userId: string; now: Date; prefs: BriefingPrefs }) =>
      composeDailyBrief({ ...args, db: dbThunk() }));
  const send =
    input.sendImpl ??
    ((args: { userId: string; brief: DailyBrief }) =>
      sendDailyBrief({ userId: args.userId, brief: args.brief, db: dbThunk() }));
  const weeklyDay = input.weeklyDay ?? 1; // Monday

  const users = await listUsers();
  result.users_considered = users.length;

  for (const userId of users) {
    let prefs: BriefingPrefs;
    try {
      prefs = await loadPrefsFn(userId);
    } catch (e) {
      result.failed += 1;
      result.errors.push({ user_id: userId, error: errString(e) });
      continue;
    }

    const skip = shouldSkip(prefs, input.now, weeklyDay);
    if (skip) {
      result.skipped += 1;
      result.skip_reasons[skip] += 1;
      continue;
    }

    let brief: DailyBrief;
    try {
      brief = await compose({ userId, now: input.now, prefs });
    } catch (e) {
      result.failed += 1;
      result.errors.push({ user_id: userId, error: errString(e) });
      continue;
    }

    let sendRes: SendDailyBriefResult;
    try {
      sendRes = await send({ userId, brief });
    } catch (e) {
      result.failed += 1;
      result.errors.push({ user_id: userId, error: errString(e) });
      continue;
    }

    if (sendRes.ok) {
      result.sent += 1;
    } else if (sendRes.error === 'no_active_integration') {
      result.skipped += 1;
      result.skip_reasons.no_active_integration += 1;
    } else {
      result.failed += 1;
      result.errors.push({
        user_id: userId,
        error: sendRes.error ?? 'unknown_send_error',
      });
    }
  }

  return result;
}

// shouldSkip — pure decision over (prefs, now). Returns the SkipReason
// or null when the user should receive a brief at this tick.
export function shouldSkip(
  prefs: BriefingPrefs,
  now: Date,
  weeklyDay = 1,
): SkipReason | null {
  if (prefs.paused) return 'paused';
  if (prefs.frequency === 'paused') return 'frequency_paused';
  if (prefs.frequency === 'weekly') {
    const isoDay = isoWeekdayInTz(now, prefs.timezone);
    if (isoDay !== weeklyDay) return 'wrong_day_for_weekly';
  }
  const localHour = hourInTz(now, prefs.timezone);
  if (localHour !== prefs.send_hour) return 'wrong_local_hour';
  return null;
}

function hourInTz(d: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  });
  const s = fmt.format(d);
  // hour12:false in en-US returns "00" through "23" — but Safari/Node
  // 20 sometimes return "24" at midnight. Coerce 24 → 0.
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return n === 24 ? 0 : n;
}

function isoWeekdayInTz(d: Date, timezone: string): number {
  // Map Intl 'weekday: short' → ISO 1-7 (Mon-Sun).
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[fmt.format(d)] ?? 0;
}

async function listConnectedUsers(
  client: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<string[]> {
  const res = await client
    .from('email_integrations')
    .select('actor_email')
    .is('disconnected_at', null);
  if (res.error) {
    throw new Error(`listConnectedUsers failed: ${res.error.message}`);
  }
  const rows = (res.data ?? []) as Array<{ actor_email: string }>;
  return Array.from(new Set(rows.map((r) => r.actor_email)));
}

function errString(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const __test__ = { hourInTz, isoWeekdayInTz, shouldSkip, listConnectedUsers };
