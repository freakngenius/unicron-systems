# PLAN — Demo Polish UX Gate 13W-B: cron + send

**Branch:** `demo-polish-ux/gate13w-cron-send`
**Base:** `origin/main` `6a0c230` (post 13W-A merge `99d2e90`)
**Worktree:** `Pathfinder-worktrees/gate13w-cron-send/`

## Goal

Schedule daily brief composition + send the brief to each user via their
connected Gmail / Outlook account. Stub behind `BRIEFING_CRON_ENABLED`
so we don't spam operators while 13W-C / 13W-D verification is in
flight.

## Two divergences from the prompt — surfaced for review

1. **Cron cadence.** Prompt says `0 7 * * *`. We use `0 * * * *`
   (hourly, on the hour) so each user's `briefing_prefs.send_hour` and
   `timezone` are honored. The prompt allows "one cron that iterates
   users" as the alternative; hourly + per-user gate is the cleanest
   way to make the timezone column meaningful from day one. Without it,
   a 7am-UTC cron sends Kyle's brief at midnight PT.
2. **Body content-type.** `lib/email/send.ts` is plain-text only
   (`Content-Type: text/plain; charset=UTF-8`). Adding HTML send is
   out of scope for 13W-B. We send the markdown body as plain text;
   Gmail / Outlook render markdown as readable plain text. HTML
   rendering can land in a follow-up gate that extends `sendEmail`.

## Scope

### `services/briefer/send.ts` (new)

```ts
sendDailyBrief({
  userId, brief, db?, sendImpl?, fetchImpl?, integration?,
}): Promise<{
  ok: boolean,
  message_id: string | null,
  error: string | null,
  outreach_send_id: string | null,
}>
```

- Picks the user's most recent active `email_integrations` row
  (`getActiveIntegration` with provider preference: gmail then outlook).
  If none active, returns `{ ok: false, error: 'no_active_integration' }`
  without writing to `outreach_sends`.
- Calls `sendEmail` with `subject = brief.subject`, `body = brief.markdown`,
  `fromEmail = integration.account_email`, `toEmail = integration.account_email`
  (brief is sent from the operator to themselves).
- Inserts `outreach_sends` row with `type='briefing'`, `project_id=null`
  (allowed by the 13W-A migration's CHECK), `user_id`, `to_email`,
  `subject`, `body`, `provider`, `message_id`, `status`.

### `lib/inngest/functions/daily-briefing.ts` (new)

```ts
export const dailyBriefingCron = inngest.createFunction(
  { id: 'pathfinder-daily-briefing-cron', triggers: [{ cron: 'TZ=UTC 0 * * * *' }] },
  async ({ step }) => step.run('iterate-and-send', async () => {
    if (process.env.BRIEFING_CRON_ENABLED !== '1') {
      return { skipped: 'BRIEFING_CRON_ENABLED=0', users_considered: 0, sent: 0, failed: 0 };
    }
    return runDailyBriefingForAllUsers({ now: new Date() });
  }),
);
```

`runDailyBriefingForAllUsers({ now, db?, … })` (exported, testable) does:

1. Fetch distinct `actor_email`s from `email_integrations` where
   `disconnected_at IS NULL`.
2. For each user:
   - Load prefs (`loadPrefs` from 13W-A).
   - Skip if `paused = true`, `frequency = 'paused'`, or
     `frequency = 'weekly' AND now.weekday(timezone) != Monday`.
   - Compute the user's local hour via `Intl.DateTimeFormat`. Skip if
     `localHour !== prefs.send_hour`.
   - `composeDailyBrief({ userId, now, prefs })`.
   - `sendDailyBrief({ userId, brief })`. Catch + log errors per user;
     don't let one bad user halt the loop.
3. Return `{ users_considered, sent, skipped, failed, errors[] }`.

### `lib/inngest/functions/index.ts` — append `dailyBriefingCron` export

(Trust git's three-way merge per Pathfinder protocol — append only.)

### `tests/briefer-send.test.ts` (new)

- `sendDailyBrief` happy path: integration found, sendEmail returns
  message_id, outreach_sends row inserted with `type='briefing'` +
  `status='sent'`.
- `no_active_integration`: returns `{ ok: false }` and does not insert.
- send failure: returns `{ ok: false, error }` and inserts row with
  `status='failed'`.

### `tests/daily-briefing-cron.test.ts` (new)

- `runDailyBriefingForAllUsers` with `BRIEFING_CRON_ENABLED=0` early-exits.
- Per-user gate: skips when `paused=true`, when `frequency='paused'`,
  when `localHour != send_hour`, when weekly and not Monday.
- Per-user error isolation: one user's send failure does not abort
  the loop; counts reflect both successes and failures.

## Hard constraints

- ✅ `BRIEFING_CRON_ENABLED=0` default → no sends in production until
  13W-D verification is signed off.
- ✅ Schema unchanged — 13W-A's migration is sufficient.
- ✅ No HubSpot scope expansion.
- ✅ No `lib/email/send.ts` modification — body content-type stays
  plain-text; HTML rendering deferred.
- ✅ Per-user error isolation — one bad user can't block the rest.
- ✅ Houston flagship, cross-pollination, agent_runs untouched.

## Commit chain

```
1. docs: gate 13W-B PLAN
2. feat(briefer): gate 13W-B — sendDailyBrief wrapper + tests
3. feat(inngest): gate 13W-B — daily-briefing cron + per-user iterator + tests
```
