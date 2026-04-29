# HubSpot ↔ Pathfinder stage map

The bidirectional translation between Pathfinder's `lead_actions.status` enum and HubSpot's deal pipeline stage IDs. This is the canonical reference; the live source of truth in code is `lib/hubspot/stage-map.ts`.

HubSpot stage IDs are **portal-specific opaque strings** (not the display name). They live in environment variables so a sandbox portal and the production Zedcor portal can map the same Pathfinder statuses to different stage IDs without a code change.

## The map

| Pathfinder `lead_actions.status` | HubSpot stage (display name)  | HubSpot stage ID env var       | Mirror direction       |
| -------------------------------- | ----------------------------- | ------------------------------ | ---------------------- |
| `accepted`                       | "Lead pushed from Pathfinder" | `HUBSPOT_STAGE_ACCEPTED_ID`    | Pathfinder → HubSpot   |
| `meeting_booked`                 | "First Meeting Booked"        | `HUBSPOT_STAGE_MEETING_ID`     | HubSpot → Pathfinder   |
| `proposal_sent`                  | "Proposal Sent"               | `HUBSPOT_STAGE_PROPOSAL_ID`    | HubSpot → Pathfinder   |
| `closed_won`                     | "Closed Won"                  | `HUBSPOT_STAGE_WON_ID`         | HubSpot → Pathfinder   |
| `closed_lost`                    | "Closed Lost"                 | `HUBSPOT_STAGE_LOST_ID`        | HubSpot → Pathfinder   |
| `dismissed`                      | (no HubSpot mirror)           | —                              | Local-only             |
| `snoozed`                        | (no HubSpot mirror)           | —                              | Local-only             |

Five Pathfinder statuses round-trip with HubSpot. Two are local-only — they never push to HubSpot and never come back from it.

## When each transition fires

- **`accepted`** — written by `lib/lead-actions:acceptLead` whenever a rep taps accept (Slack bot button in P0-04, chat-panel action in P0-01, or any other caller of `POST /api/hubspot/push-deal`). Pathfinder also creates the HubSpot deal at this moment.
- **`meeting_booked`** — written by `applyHubspotStageEvent` when HubSpot reports the deal moved to the meeting-booked stage. Typically driven by the rep dragging the deal in HubSpot or a HubSpot meeting-link automation.
- **`proposal_sent`** — same pattern; Pathfinder reflects the HubSpot move.
- **`closed_won`** — same pattern. Additionally stamps `closed_won_at` and `closed_won_amount` on the `lead_actions` row. Amount preference: HubSpot-supplied amount > rep's attested pipeline value at accept.
- **`closed_lost`** — same pattern. `closed_lost_reason` is left null unless the chat panel or a future "edit lead action" UI captures the reason explicitly.
- **`dismissed`** — written by Slack bot's "Dismiss" button or chat-panel's `dismiss_lead` action via `recordLocalAction`. Never pushed to HubSpot.
- **`snoozed`** — same pattern as `dismissed`.

## Discovering HubSpot stage IDs in your portal

```bash
curl -s -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  https://api.hubapi.com/crm/v3/pipelines/deals \
  | jq '.results[] | {label: .label, id: .id, stages: [.stages[] | {label: .label, id: .stageId, displayOrder: .displayOrder}]}'
```

Pick the pipeline you want Pathfinder to write into, copy its `id` to `HUBSPOT_DEAL_PIPELINE_ID`, then copy each relevant `stageId` to its corresponding `HUBSPOT_STAGE_*_ID` env var.

## What happens on an unknown HubSpot stage

If HubSpot reports a stage transition to an ID that does **not** match any of the five mirrored env vars, `applyHubspotStageEvent` returns `{ kind: 'unknown_stage' }` and audit-logs the event. The `lead_actions` row is left untouched. This is the desired behavior: it prevents a custom HubSpot stage (e.g., "Decision Maker Bought-In") from silently corrupting the Pathfinder status. Surface the unknown stages in the briefing or a follow-up reconcile cron, then either widen the map or extend the enum.

## What happens on a deal HubSpot reports that we didn't push

If HubSpot reports a stage event for a deal whose `objectId` is not present in `lead_actions.hubspot_deal_id`, `applyHubspotStageEvent` returns `{ kind: 'unknown_deal' }` and audit-logs it. We do not auto-create rows from HubSpot — the source of truth for "is this a Pathfinder lead" is whether Pathfinder pushed it.
