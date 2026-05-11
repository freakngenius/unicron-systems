# Slack channel membership audit — runbook (Stream S1)

Part of the Slack Daily Scan + Atrium Digest end-to-end build.

This stream ships the tooling to enumerate every public channel in the
workspace and every private/MPIM conversation the orchestrator bot can
already see, and to report which of those the bot is currently a member of.
The output drives a Bug Fix card listing operational **public** channels
Kyle needs to manually invite `@unicron-orchestrator` into before the daily-
scan loop (Stream S2) covers them. Discovering missing private-channel
memberships is **not possible** from a bot token (see Coverage limits
below) and is tracked separately.

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
messages once you're in a channel). Listing the workspace itself needs:

- `channels:read` — public channel list (workspace-wide)
- `groups:read` — private channels the bot has been added to
- `mpim:read` — MPIMs the bot has been added to

`mpim:history` is intentionally **not** granted in this PR — S1 only calls
`conversations.list` and never reads MPIM content. It will be added in a
follow-on PR if/when an Atrium feature actually consumes MPIM history.

The `slack-app-manifest.json` in this PR is the source of truth for the app's
scope set. **After this PR merges**, Kyle re-installs the app from
[api.slack.com/apps → Unicron Orchestrator](https://api.slack.com/apps) so the
new scopes take effect on the existing `SLACK_ORCHESTRATOR_BOT_TOKEN`.

If `npm run slack:audit` fails with `missing_scope`, the manifest update has
not been applied — re-install the app.

## Coverage limits (bot-token reality)

Slack's scope docs make this explicit:

- `channels:read` returns **every** public channel in the workspace,
  whether the bot is a member or not. → `bot_missing_total` for
  `public_channel` is meaningful and actionable.
- `groups:read` returns **only** private channels the bot has already been
  added to. → A private channel the bot has never been invited to will
  never appear in the report.
- `mpim:read` returns **only** MPIMs the bot has already been added to.

The audit summary now labels each per-type row with `coverage = workspace`
(complete) or `coverage = bot_visible_only` (lower bound). Discovering
private channels the bot was never invited to requires an admin user token
sweep using `admin.conversations.search` — out of scope for S1, tracked as
a separate Bug Fix card.

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

1. Header counts:
   - `visible_total` — active (non-archived) channels the audit can see.
   - `bot_member_total` — bot is a member of this many.
   - `bot_missing_total` — visible-but-not-bot-member. Only meaningful for
     `public_channel` rows; private/MPIM rows are bot-visible-only.
2. Per-type rollup with a `coverage` column (`workspace` vs
   `bot_visible_only`).
3. A flat table sorted with bot-member channels first, then by type
   (`public_channel` → `private_channel` → `mpim`), then by name. Each row:
   name · id · type · bot? · members · last activity.

Default `exclude_archived: true` — the audit reports active channels only.
This is reflected in the header line ("active" vs "incl. archived"). To
include archived channels for an inventory pass, edit the script.

Example output skeleton:

```markdown
- Visible channels (active): **42**
- Bot is member of: **6**
- Bot missing from (visible only): **36**

| type | total | bot member | coverage |
|---|---:|---:|---|
| public_channel | 24 | 5 | workspace |
| private_channel | 16 | 1 | bot_visible_only |
| mpim | 2 | 0 | bot_visible_only |

| name | id | type | bot? | members | last activity |
|---|---|---|:---:|---:|---|
| general | C012… | public_channel | ✓ | 8 | 2026-05-11T14:02:00.000Z |
| ...
```

---

## What to do with the report

After the first run produces a real list, file **two** Bug Fix cards on the
**Internal Org Kanban** (per `CLAUDE.md` § kanban semantics):

> **Card 1 — Invite @unicron-orchestrator to operational public channels**
>
> Lists every `public_channel` row where `bot? = ·` and the channel is
> operational. For each: open the channel in Slack → `/invite
> @unicron-orchestrator`. Skip noisy / off-topic channels (`#random`,
> alumni, etc.) at the reviewer's discretion. The daily scan (S2) only
> iterates channels the bot is a member of, so anything not invited is
> silently skipped.

> **Card 2 — Private-channel membership discovery via admin user token**
>
> Bot tokens cannot enumerate private channels the bot was never invited
> to. To find the gap, write a one-shot script using an admin user token
> with `admin.conversations:read` calling `admin.conversations.search`,
> filtering to `private_channel`. The output is a candidate list that Kyle
> manually walks and decides which to invite the orchestrator into. Track
> this as follow-on work, not blocking S2/S3/S4.

Re-run `npm run slack:audit` after the invites land to confirm the
`bot_missing_total` for public channels has dropped to the residual set.

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
