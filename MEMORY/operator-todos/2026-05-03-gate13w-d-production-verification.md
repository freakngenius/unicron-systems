# Gate 13W-D — Daily Brief Production Verification

**Status:** Awaiting operator (Kyle) action.
**Pre-conditions:** PRs 13W-A (#131), 13W-B (#139), 13W-C (#140) must
be merged to `main` and deployed (Vercel auto-deploys on merge).
Migration 0122_briefing_prefs must be applied to live Supabase.

## What we're verifying

1. The brief composer reads real data from production Supabase.
2. The send wrapper picks the right email integration and sends from
   the operator's connected mailbox.
3. The email lands in the operator's inbox with a sane subject,
   readable body, and working links.
4. The `outreach_sends` row is logged with `type='briefing'`.

## One-time setup

- [ ] Apply migration `0122_briefing_prefs.sql` to live Supabase via
  the Supabase MCP `apply_migration` tool. Additive, idempotent.
- [ ] Confirm `kyle@freakngenius.com` has an active row in
  `pathfinder.email_integrations` (gmail or outlook). If not, connect
  one at `/pathfinder/settings/connectors`.

## Verification — Path A (recommended): in-app dispatch

The point of 13W-C is that this works from the UI.

1. Navigate to `https://unicron.systems/pathfinder/settings/briefing`.
2. The form should auto-populate with defaults (daily, 7am
   `America/Los_Angeles`, all sections enabled, not paused).
3. Click **Preview**. The preview pane should render with the brief's
   subject + markdown body. Verify subject reads
   `Pathfinder daily brief — YYYY-MM-DD — N new leads, M follow-ups due`
   (or `quiet day` if the metrics are zeroed).
4. Click **Send me one now**.
5. Check inbox at `kyle@freakngenius.com` (or your connected mailbox).
   Email should arrive within ~10 s.

### Pass criteria

- [ ] Email arrives.
- [ ] Subject matches the format above.
- [ ] Body renders the five section headings (`## Top new leads`,
      `## Follow-ups due`, `## Deal stage changes`,
      `## Replies received`, `## Contacts pending review`) — each
      either has bulleted lead links or an italicized empty-state line.
- [ ] Each lead link points to
      `https://unicron.systems/pathfinder/leads/<projectId>` and resolves
      (200, lead detail page renders).
- [ ] Footer renders the "Manage your daily brief at …/settings/briefing"
      link.
- [ ] One row in `pathfinder.outreach_sends` with
      `type='briefing'`, `user_id='kyle@freakngenius.com'`,
      `status='sent'`, `provider in ('gmail','outlook')`,
      `message_id` populated, `project_id` null.

## Verification — Path B (CLI fallback)

If the UI dispatch fails or you want to debug from a terminal:

```bash
cd Pathfinder
pnpm tsx scripts/send-test-briefing.ts kyle@freakngenius.com
```

Required env: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(in `.env.local`). Pulls the operator's email integration directly,
composes, sends.

Exit codes:
- `0` → sent ok; check inbox
- `1` → no active integration
- `2` → send failure (provider error printed)
- `3` → compose failure (DB / data error printed)

## SQL probes (after a successful send)

```sql
-- Most recent briefing send
select id, type, user_id, to_email, subject, provider, status, message_id, sent_at
from pathfinder.outreach_sends
where type = 'briefing'
order by sent_at desc
limit 5;

-- Brief stats by operator over last 7 d
select user_id, status, count(*) as n
from pathfinder.outreach_sends
where type = 'briefing'
  and sent_at >= now() - interval '7 days'
group by 1, 2
order by 1, 2;

-- Token-leak guard: no body should contain access tokens
select id, sent_at
from pathfinder.outreach_sends
where type = 'briefing'
  and (body ilike '%access_token%' or body ilike '%refresh_token%' or body ilike '%bearer %');
-- Expect 0 rows.
```

## Enable the cron (after Path A passes)

Once the manual dispatch verifies, set the env var to enable hourly
auto-send:

```bash
vercel env add BRIEFING_CRON_ENABLED production
# value: 1
```

The Inngest function will then iterate connected operators each hour
and fire briefs at each user's `briefing_prefs.send_hour` (in
`briefing_prefs.timezone`).

## Failure playbook

| Symptom | Likely cause | Fix |
|---|---|---|
| 412 from /dispatch with `error: 'no_active_integration'` | Operator hasn't connected gmail/outlook | Connect at `/pathfinder/settings/connectors` |
| Email lands but body is HTML tags / raw markdown | Email client doesn't render markdown as plain text | Acceptable for v1 — HTML send extension is a follow-up gate (see 13W-B PR body) |
| `outreach_sends` insert fails with FK error on project_id | `project_id` not-null check still in place | Migration 0122 didn't apply — re-run `apply_migration` |
| Cron doesn't fire | `BRIEFING_CRON_ENABLED` not set | `vercel env add` (see above) |
| Some users get briefs at the wrong hour | `briefing_prefs.timezone` is wrong | User edits at `/pathfinder/settings/briefing` |

## Sign-off

When all pass-criteria check boxes above are ticked, append the run
to `MEMORY/demo-polish-ux-sprint-live-status.md` as a Gate 13W-D
"verified in production" entry with the actual `outreach_sends.id` of
the test send.
