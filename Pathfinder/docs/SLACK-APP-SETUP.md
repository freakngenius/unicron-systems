# SLACK-APP-SETUP — Creating the Pathfinder Slack App

**Owner:** Kyle (manual Slack-App creation on api.slack.com) ↔ Claude (code that consumes the resulting credentials)
**Companion plan:** `docs/PLAN-P0-04-SLACK.md`
**Branch:** `feat/p0-04-slack-bot`

This doc captures everything needed to register the Pathfinder Slack App and connect it to the codebase. Run through it once during initial setup; come back to it any time the manifest changes (e.g., adding scopes for a new feature).

---

## 1. Prerequisites

- Slack workspace where you have permission to create apps (any workspace works for app *creation*; per-customer installs happen separately).
- Vercel access to set environment variables in the Pathfinder project.
- Pathfinder reachable at `https://www.unicron.systems/pathfinder/...` on the public internet — Slack pings the redirect URL during install and the events URL during message dispatch. The Pathfinder app is mounted under the `/pathfinder` basePath via a server-side rewrite from the parent unicron-systems Next.js project; do not use the bare Vercel deploy hostname (`pathfinder-ashy.vercel.app`) for Slack's redirect URLs because the parent rewrite preserves the canonical host.

## 2. Create the app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. App name: `Pathfinder` (or `Pathfinder (dev)` for a separate test app — recommend keeping dev and prod as **two distinct apps** so test installs can't pollute production tokens).
3. Pick the workspace you'll use as your "developer sandbox" — this is just where the app lives during development. Customer installs go into their own workspaces.
4. After creation, you land on the app's **Basic Information** page. Bookmark this page; you'll come back for the env-var values.

## 3. OAuth & Permissions

Navigate to **OAuth & Permissions** in the left sidebar.

### 3a. Redirect URLs

Under **Redirect URLs**, add the production callback:

```
https://www.unicron.systems/pathfinder/api/slack/install/callback
```

If you keep a separate dev app, also add a Vercel preview URL or an ngrok tunnel pointing at `localhost:3000/api/slack/install/callback`. The redirect URL is the **only** URL Slack will redirect to after a successful install — it must match exactly, scheme included.

> **Why we don't use `/api/slack/install` directly:** the `start` endpoint that builds the OAuth URL is basic-auth-gated (operators only); the `callback` endpoint that Slack hits is public (auth via signed state token). Splitting them lets us use the existing `middleware.ts` basic-auth pattern without breaking Slack's redirect.

### 3b. Bot Token Scopes

Under **Scopes** → **Bot Token Scopes**, add each of the following. The "why" column is for future-you wondering whether each one is still needed.

| Scope                | Why                                                         |
| -------------------- | ----------------------------------------------------------- |
| `chat:write`         | Post messages into channels we're a member of               |
| `chat:write.public`  | Post into channels we're not in (fallback for routing)      |
| `commands`           | Forward-compat for future slash commands; not used in v1    |
| `users:read`         | Resolve a button-tapper's `user.id` → display name          |
| `users:read.email`   | Resolve `user.id` → email for `acceptLead({actorEmail})`    |
| `im:write`           | Open DMs to per-rep targets (planned v2)                    |
| `views:write`        | Open the Accept modal via `views.open`                      |
| `team:read`          | Display workspace name on the install-success page          |

User Token Scopes: **none**. Pathfinder never acts as a user.

### 3c. Save the credentials (don't paste here yet — keep them in 1Password / Vercel only)

From **Basic Information** → **App Credentials**:
- **Client ID** → `SLACK_CLIENT_ID`
- **Client Secret** → `SLACK_CLIENT_SECRET`
- **Signing Secret** → `SLACK_SIGNING_SECRET`

## 4. Event Subscriptions

Navigate to **Event Subscriptions**. Toggle **Enable Events** on.

**Request URL:**
```
https://www.unicron.systems/pathfinder/api/slack/events
```

Slack will perform a `url_verification` handshake when you enter this URL — the route handler at `app/api/slack/events/route.ts` echoes the challenge string back. If verification fails, double-check that the route is deployed and that `SLACK_SIGNING_SECRET` is set in Vercel for the matching environment.

**Subscribe to bot events:**

| Event             | Why                                                |
| ----------------- | -------------------------------------------------- |
| `app_uninstalled` | Stamp `slack_workspaces.uninstalled_at` on removal |

No other events in v1. We do **not** subscribe to `message.*` events — the bot is one-way (we post; reps tap buttons).

## 5. Interactivity & Shortcuts

Navigate to **Interactivity & Shortcuts**. Toggle **Interactivity** on.

**Request URL:**
```
https://www.unicron.systems/pathfinder/api/slack/actions
```

This is the single endpoint Slack POSTs to for:
- Button taps on lead messages (`block_actions`).
- Modal submissions on the Accept modal (`view_submission`).

**Select Menus:** none required for v1.
**Shortcuts:** none required for v1.
**Slash Commands:** none in v1 (the `commands` scope is reserved for forward-compat).

## 6. App Manifest (alternative path — optional)

If you'd rather paste a manifest than click through all the above, this is the equivalent v2 manifest. Use **App Manifest** in the left sidebar → **Edit Manifest** → paste:

```yaml
display_information:
  name: Pathfinder
  description: Move-the-needle leads for your branch network
  background_color: "#0B0F14"
features:
  bot_user:
    display_name: Pathfinder
    always_online: true
oauth_config:
  redirect_urls:
    - https://www.unicron.systems/pathfinder/api/slack/install/callback
  scopes:
    bot:
      - chat:write
      - chat:write.public
      - commands
      - users:read
      - users:read.email
      - im:write
      - views:write
      - team:read
settings:
  event_subscriptions:
    request_url: https://www.unicron.systems/pathfinder/api/slack/events
    bot_events:
      - app_uninstalled
  interactivity:
    is_enabled: true
    request_url: https://www.unicron.systems/pathfinder/api/slack/actions
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

## 7. Vercel environment variables

Set these in **Vercel → Pathfinder project → Settings → Environment Variables**. Use the **Production** scope plus **Preview** scope if you want preview deployments to install into the dev app.

| Variable                | Value source                                  |
| ----------------------- | --------------------------------------------- |
| `SLACK_CLIENT_ID`       | api.slack.com → Basic Information             |
| `SLACK_CLIENT_SECRET`   | api.slack.com → Basic Information             |
| `SLACK_SIGNING_SECRET`  | api.slack.com → Basic Information             |
| `SLACK_BOT_TOKEN`       | (dev-only fallback) the `xoxb-…` token Slack issued for the dev workspace install. Production reads from `pathfinder.slack_workspaces.bot_token`. |

Leave the existing `SLACK_WEBHOOK_URL` in place — `lib/notifications.ts` still uses it as a fallback when no workspace install exists for the briefing target.

## 8. Per-customer install flow (production)

Once the app is live and the code is deployed, installing into a customer's Slack workspace works like this:

1. **Operator** (Kyle) hits `https://www.unicron.systems/pathfinder/api/slack/install/start` in a browser. Basic-auth prompt appears (existing dashboard creds).
2. After basic-auth, the route 302s to `slack.com/oauth/v2/authorize?client_id=…&scope=…&redirect_uri=…&state=…`.
3. Operator picks the customer's workspace from the Slack switcher (or asks the customer to do this on their end via a screen-share / a forwarded short-lived link).
4. The customer's workspace admin approves the requested scopes.
5. Slack redirects to `/api/slack/install/callback?code=…&state=…`.
6. Pathfinder verifies the state token, exchanges the code, and inserts the workspace into `pathfinder.slack_workspaces`.
7. A success page renders: `Pathfinder is installed into {team_name}. Routing config:` followed by a stub for branch-channel mapping (operator fills this in via SQL or a future settings UI).
8. Operator seeds `pathfinder.slack_branch_routes` rows mapping `(team_id, branch_id) → channel_id` for each branch in the workspace's footprint. Until those rows exist, lead messages have nowhere to go.

For the Zedcor pilot specifically, plan on doing steps 1–7 with Kyle Doenz on a screen-share, then seeding `slack_branch_routes` in a single SQL run before the first cron tick.

## 9. Test-workspace walkthrough

Use a **personal** Slack workspace for end-to-end smoke tests so you don't spam the dev workspace with test messages.

1. Confirm the dev app's redirect URL points at the deployment under test (production or a Vercel preview URL).
2. Hit `/api/slack/install/start` from a browser; complete the OAuth flow into your personal workspace.
3. Insert a test row into `pathfinder.slack_branch_routes` mapping your test workspace `team_id` + the seeded `'TEST'` branch (or any existing branch) to a channel you've invited the bot to.
4. Manually run the cron once: `curl -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/slack-alerts`.
5. Verify the channel receives a message with the four-button action row.
6. Tap each button in turn; confirm the message updates in place and `pathfinder.lead_actions` rows appear with the correct status.
7. For the accept path, confirm the modal opens, accepts pipeline value + first-action date, and the deal lands in HubSpot (P0-03 must be deployed for this leg to fully exercise).
8. Capture screenshots of: (a) the channel message with buttons, (b) the accept modal, (c) the post-resolution channel message + thread reply, (d) the resulting `lead_actions` row in Supabase. Drop them into `docs/screenshots/slack/` and link from this doc.

Screenshots placeholder — added during step 10 of `docs/PLAN-P0-04-SLACK.md` § Build sequence.

## 10. Planned v2: Per-rep DM mapping

V1 ships with **per-channel routing** only — the cron posts high-priority leads into a branch's mapped channel and uses `<!here>` to summon online members. This is intentional sequencing, not an oversight; it lets us land the install + button flow without coupling the bot to a rep-onboarding flow we don't have yet.

V2 adds:
- A settings UI (or admin-only API) that maps each Pathfinder rep email to their Slack `user_id` per workspace.
- The alerts cron prefers a per-rep DM (`im.open` → `chat.postMessage`) when a route's `rep_user_id` is populated, falling back to the channel + `<!here>` post otherwise.
- An invite/onboarding email sent to each rep with a one-tap "Confirm my Slack identity" link that completes the mapping.
- Optional Slack-side OAuth flow per rep (using a separate app with `users:read` user-token scope) if we need richer rep-side actions later.

The schema is already forward-compatible — `pathfinder.slack_branch_routes.rep_user_id` and `.rep_email` columns exist as nullable, populated in v2.

## 11. Troubleshooting

| Symptom                                                       | Likely cause                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `url_verification` fails when saving Event Subscriptions URL  | `SLACK_SIGNING_SECRET` not set in the deployment, or route not yet deployed   |
| Install redirects to Slack but never returns to Pathfinder    | Redirect URL mismatch — check exact match including `https://` and trailing path |
| `invalid_auth` from `oauth.v2.access`                          | Wrong `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`, or the dev/prod apps were swapped |
| Button taps never fire the route                              | Interactivity URL not set, or signing-secret mismatch (signature verification fails silently) |
| Modal opens but submit is rejected                            | `trigger_id` consumed >3s after the button click; ack flow needs to be faster — see `lib/slack/actions.ts` |
| `not_in_channel` when posting to a routed channel             | Bot needs to be invited to the channel, or use `chat:write.public` scope (already in our list) |
| `missing_scope` errors                                        | Re-install the app into the workspace after adding scopes — old tokens don't gain new permissions retroactively |

## 12. References

- Slack API docs: <https://api.slack.com/>
- OAuth v2 reference: <https://api.slack.com/methods/oauth.v2.access>
- Block Kit Builder (preview messages before shipping): <https://app.slack.com/block-kit-builder>
- Signing-secret verification recipe: <https://api.slack.com/authentication/verifying-requests-from-slack>
