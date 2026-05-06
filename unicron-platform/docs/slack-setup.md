# Slack Setup — Unicron Orchestrator

One-time human-run setup steps to wire the Orchestrator Slack app into the workspace.

---

## 1. Create the Slack App

1. Go to https://api.slack.com/apps → **Create New App** → **From a manifest**.
2. Select your Unicron workspace.
3. Switch to the **JSON** tab and paste the contents of `unicron-platform/slack-app-manifest.json`.
4. Click **Next** → **Create**.

---

## 2. Install to Workspace

1. In the app settings sidebar click **Install App** → **Install to Workspace**.
2. Authorize the requested scopes.
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

---

## 3. Add Vercel Environment Variables

Add the following to the Unicron Platform project in the Vercel dashboard
(Settings → Environment Variables — add to all environments, or at minimum Production):

| Variable | Value | Source |
|---|---|---|
| `SLACK_ORCHESTRATOR_BOT_TOKEN` | `xoxb-…` | Bot User OAuth Token (step 2) |
| `SLACK_SIGNING_SECRET` | `…` | App settings → Basic Information → Signing Secret |

> These vars are consumed server-side only (the `api/slack/` handlers). They are **never** exposed to the browser bundle.

---

## 4. Create the Required Channels

None of the six channels existed in the workspace as of Sprint 2 (confirmed via Slack MCP search).
Create each one via the Slack web UI or the CLI command shown below, then set the topic.

### Channels to create

| Channel | Topic |
|---|---|
| `#orchestrator-feed` | Daily digests, weekly retros, decay reports (Analyst posts here) |
| `#orchestrator-escalations` | Taboo Keeper bounces, action items missing DRI, verify gate failures |
| `#pathfinder-action-items` | New action items for Pathfinder surface |
| `#metacron-action-items` | New action items for Metacron surface |
| `#internal-action-items` | New action items for internal operations |
| `#sales-action-items` | New action items for sales surface |

### Via Slack web UI

1. Click **+** next to **Channels** in the sidebar → **Create a channel**.
2. Enter the channel name (no `#` prefix), set it to **Public** or **Private** as appropriate.
3. After creation, open the channel → click the channel name at the top → **Edit** → set the **Topic** from the table above.

### Via Slack CLI (optional)

```bash
# Requires SLACK_TOKEN env var with channels:write scope
for ch in orchestrator-feed orchestrator-escalations pathfinder-action-items metacron-action-items internal-action-items sales-action-items; do
  curl -s -X POST https://slack.com/api/conversations.create \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$ch\", \"is_private\": false}"
done
```

---

## 5. Pin a Welcome Message in `#orchestrator-feed`

After creating the channel:

1. Post the following message in `#orchestrator-feed`:

   > Welcome to `#orchestrator-feed`. This channel receives daily digests, weekly retros, and decay reports from the Unicron Orchestrator agent.
   > Atrium dashboard → https://atrium.unicron.systems

2. Hover over the message → **More actions (…)** → **Pin to channel**.

---

## 6. Update Vercel Routes (if needed)

The `vercel.json` rewrites rule (`/((?!api/).*)` → `/index.html`) already excludes `api/` paths,
so `POST /api/slack/events` and `POST /api/slack/commands` will reach the serverless functions
without any routing changes.

---

## 7. Verify the Event Endpoint

Once deployed:

1. In the Slack app settings → **Event Subscriptions** → enable events.
2. Enter `https://atrium.unicron.systems/api/slack/events` as the Request URL.
3. Slack will POST a `url_verification` challenge. The handler returns `{"challenge": "…"}` immediately — Slack will show a green checkmark.

---

## Channel IDs

Once channels are created, record their IDs here for use by downstream agents:

| Channel | ID |
|---|---|
| `#orchestrator-feed` | _not yet created_ |
| `#orchestrator-escalations` | _not yet created_ |
| `#pathfinder-action-items` | _not yet created_ |
| `#metacron-action-items` | _not yet created_ |
| `#internal-action-items` | _not yet created_ |
| `#sales-action-items` | _not yet created_ |

Update this table after running the channel creation steps above.
