---
name: morning-brief
description: Compose and deliver the operator's morning brief — yesterday's ledger digest, top escalations, sprint status; optionally posts to Slack DM
domain: productivity
type: manual
inputs:
  - name: team_member_id
    type: uuid
    required: false
    description: Recipient team_member id. If omitted, returns the message string only and skips Slack delivery.
outputs:
  - type: api_response
    location: '{ message: string, delivered_via_slack: boolean }'
  - type: slack_message
    location: DM to the team member's slack_user_id (only when SLACK_BOT_TOKEN and team_member_id are present)
schedule_cron: "TZ=America/Los_Angeles 0 7 * * 1-5"
refusal_gate: no
budget_usd_per_run: 0.05
---

# morning-brief

Compose the operator's morning brief at 07:00 PT on weekdays. Pulls yesterday's high-signal ledger rows (via `ns_morning_brief_ledger`), open action items sorted by priority (via `ns_morning_brief_action_items`), and renders a Slack-formatted message. If a Slack bot token and team_member_id are present, looks up the operator's Slack user id (via `ns_get_team_member_slack_id`) and DMs the brief.

## Execution

1. Compute the `[yesterday_start, today_start)` window in `America/Los_Angeles`.
2. RPC `ns_morning_brief_ledger(p_since, p_until)` → digest of yesterday's signals (top by strength).
3. RPC `ns_morning_brief_action_items(p_limit: 3)` → open escalations + `total_count`.
4. Sort escalations by priority order: `irreversible → high → medium → low`.
5. Render Slack message:
   ```
   *Morning Brief — {weekday}, {month} {day}, {year}*

   *Yesterday's Digest*
   • [{source_type}] {content_summary}
   ...

   *Escalations* — {total_count} open
   • [{PRIORITY}] {title}
   ...

   *Sprint Status*
   Check the Atrium Work tab for active sprint details.

   _Brief generated at {HH:MM} PT_
   ```
6. If `SLACK_BOT_TOKEN` is set AND `team_member_id` is provided:
   - RPC `ns_get_team_member_slack_id(p_member_id)` → resolve `slack_user_id`.
   - POST `https://slack.com/api/chat.postMessage` with channel=slack_user_id, text=message.
   - Set `delivered_via_slack = ok === true`.
7. Return `{ message, delivered_via_slack }`.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "morning-brief", "team_member_id": "<uuid>" }`.
- Scheduled (cron): 07:00 PT Mon–Fri. The cron caller iterates active team members and invokes per member.

## Refusal gate

None. Read-only digest + DM delivery to opted-in member; no system-of-record mutations.

## Side effects

- Audit ledger row written via `ns_append_ledger_signal` with `source_type='audit'`, `source_id='skill_run/morning-brief'`.
- One Slack DM per (member, run) if delivery succeeds.

## Notes

- Slack delivery silently no-ops when `SLACK_BOT_TOKEN` is unset or the team member has no `slack_user_id`. The string `message` is still returned.
- Implementation: `unicron-platform/api/atrium/skills/run.ts → runMorningBrief()`.
