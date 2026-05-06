# unicron-platform — Required Environment Variables

All variables must be set in Vercel project settings for the `unicron-platform` deployment.
For local development copy `.env.example` (if present) or set them in `.env.local`.

---

## Supabase

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (project ID: `anfihcusvekpovcchpoh`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, never exposed to the browser |

---

## Inngest

| Variable | Description |
|---|---|
| `INNGEST_EVENT_KEY` | Event key for sending events to Inngest Cloud |
| `INNGEST_SIGNING_KEY` | Signing key for verifying Inngest requests to `/api/inngest` |
| `INNGEST_API_BASE_URL` | Inngest event API base URL (e.g. `https://inn.gs`) — used by api/slack/events.ts to dispatch events |

---

## Slack (Nervous System)

| Variable | Description |
|---|---|
| `SLACK_SIGNING_SECRET` | Signing secret for verifying Slack event payloads (api/slack/events.ts) |
| `SLACK_ORCHESTRATOR_BOT_TOKEN` | Bot token (`xoxb-...`) for the Unicron Orchestrator Slack app — used to post replies |
| `SLACK_ESCALATIONS_CHANNEL_ID` | Channel ID where escalations and Taboo Keeper bounces are posted |

---

## GitHub Vault

| Variable | Description |
|---|---|
| `GITHUB_VAULT_TOKEN` | GitHub Personal Access Token (or fine-grained token) with `contents:read/write` on `freakngenius/unicron-knowledge` — used by lib/agents/runtime.ts for agent memory read/write |

---

## Anthropic

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | API key for @anthropic-ai/sdk — used by Orchestrator (intent classification, Taboo Keeper inline check) |

---

## Added in Sprint 2 Stream B

The following variables are new in Sprint 2 (not present in Sprint 0/1):

- `SLACK_ORCHESTRATOR_BOT_TOKEN`
- `SLACK_ESCALATIONS_CHANNEL_ID`
- `GITHUB_VAULT_TOKEN`
- `ANTHROPIC_API_KEY`
- `INNGEST_API_BASE_URL`
