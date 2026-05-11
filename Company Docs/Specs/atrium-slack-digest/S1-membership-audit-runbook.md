# Slack channel membership audit — runbook (Stream S1)

Part of the Slack Daily Scan + Atrium Digest end-to-end build.

This stream ships the tooling to enumerate every channel in the workspace
and report which ones the orchestrator bot is currently a member of. The
output drives a Bug Fix card listing operational channels Kyle needs to
manually invite `@unicron-orchestrator` into before the daily-scan loop
(Stream S2) covers them.

---

## What ships in this PR

| File | Purpose |
|---|---|
| `unicron-platform/lib/slack/client.ts` | Shared Slack Web API fetch wrapper. Used by S1 audit + S2 scan. |
| `unicron-platform/lib/slack/membership-audit.ts` | Server-side audit function (consumed by S2 in-server use cases). |
| `unicron-platform/scripts/slack-membership-audit.mjs` | CLI runner. Self-contained Node ESM (no TS runtime / no extra deps). |
| `unicron-platform/slack-app-manifest.json` | Adds the OAuth scopes required to enumerate channels. |
| `unicron-platform/package.json` | Adds `npm run slack:audit`. |

---

## Required OAuth scopes (added in this PR)

The orchestrator bot already has `channels:history` and `groups:history` (read
messages once you're in a channel). Listing the workspace, however, needs:

- `channels:read` — public channel list
- `groups:read` — private channel list
- `mpim:read` — multi-party DM list
- `mpim:history` — MPIM message read (for parity with public/private once the
  daily scan extends to multi-party DMs)

The `slack-app-manifest.json` in this PR is the source of truth for the app's
scope set. **After this PR merges**, Kyle re-installs the app from
[api.slack.com/apps → Unicron Orchestrator](https://api.slack.com/apps) so the
new scopes take effect on the existing `SLACK_ORCHESTRATOR_BOT_TOKEN`.

If `npm run slack:audit` fails with `missing_scope`, the manifest update has
not been applied — re-install the app.

---

## How to run the audit

From `unicron-platform/`:

```bash
vercel env pull .env.local        # one-time, picks up SLACK_ORCHESTRATOR_BOT_TOKEN
npm run slack:audit               # writes report + prints summary
```

Defaults to writing the report to:

```
../Company Docs/Atrium/Reports/slack-membership-audit-<YYYY-MM-DD>.md
```

Override with `npm run slack:audit -- --out path/to/file.md`.

---

## Output schema

The report contains:

1. Per-type rollup (public_channel / private_channel / mpim) with totals and
   bot-member counts.
2. A flat table sorted with bot-member channels first, then by type, then by
   name. Each row: name · id · type · bot? · members · last activity.

Example output skeleton:

```markdown
- Workspace channels: **42**
- Bot is member of: **6**
- Bot missing from: **36**

| type | total | bot member |
|---|---:|---:|
| public_channel | 24 | 5 |
| private_channel | 16 | 1 |
| mpim | 2 | 0 |

| name | id | type | bot? | members | last activity |
|---|---|---|:---:|---:|---|
| general | C012… | public_channel | ✓ | 8 | 2026-05-11T14:02:00.000Z |
| ...
```

---

## What to do with the report

After the first run produces a real list, file a Bug Fix card on the **Internal
Org Kanban** (per `CLAUDE.md` § kanban semantics):

> **Title:** Invite @unicron-orchestrator to operational channels missing from membership
>
> **Body:** Lists every operational channel where `bot? = ·` in the audit
> report. For each: open the channel in Slack → `/invite @unicron-orchestrator`.
> Skip noisy / archived / off-topic channels (`#random`, alumni, etc.) at the
> reviewer's discretion. The daily scan (S2) only iterates channels the bot is
> a member of, so anything not invited is silently skipped.

Re-run `npm run slack:audit` after the invites land to confirm the
`bot_missing_total` for operational channels has dropped to zero.

---

## Why we don't auto-invite

Slack's Web API does not expose a bot self-invite endpoint, and using the user
token to programmatically invite the bot into private channels is precisely
the kind of unbounded-write side effect the refusal layer exists to prevent.
Manual invite is the right boundary — it keeps the human in the loop on which
channels the orchestrator gets to see.

---

## Pre-flight notes

This PR is read-only at runtime: no new endpoints, no migrations, no cron
schedules. The CLI script is opt-in (Kyle runs it from his shell). Vercel
build path is unchanged — `lib/slack/*` is imported by S2's Inngest function
in a follow-on PR; no S1 surface depends on it yet.
