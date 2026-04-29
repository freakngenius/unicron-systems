# `lib/lead-actions` — public interface

The canonical accept-flow library. P0-04 (Slack bot button), P0-01 (chat-panel "Accept lead" action), and any future reconcile cron all call into these functions. The public interface is **stable** — consumers can wire against it without coordinating via shared types beyond what's exported here.

## Module path

```ts
import {
  acceptLead,
  pushDealForLeadAction,
  applyHubspotStageEvent,
  recordLocalAction,
  setHubspotClientForTesting,
} from '@/lib/lead-actions';
```

## `acceptLead(input)`

Records a rep's accept of a Pathfinder lead and pushes the resulting deal to HubSpot.

```ts
interface AcceptLeadInput {
  projectId: string;
  actorEmail: string;
  attestedPipelineValue?: number | null;
  firstActionDate?: string | null;     // ISO date (YYYY-MM-DD)
  note?: string | null;
}

interface AcceptLeadResult {
  leadActionId: number;
  hubspotDealId: string | null;        // null when push failed
  pushed: boolean;                      // true only if HubSpot returned 2xx
  pushError?: string;                   // populated when pushed=false
}
```

**Semantics:**
- The accept is idempotent on `(project_id, actor_email)` — calling twice for the same rep on the same project upserts the row, preserving the existing HubSpot deal id.
- A HubSpot push failure does **not** fail the accept. The `lead_actions` row is created with `status='accepted'` and `hubspot_deal_id=null`; a daily reconcile cron (out of scope for this PR) re-pushes.
- Always call this from a server context — it requires the service-role Supabase key.

## `pushDealForLeadAction(leadActionId)`

Re-push a deal for an existing `lead_actions` row. Used by reconcile crons. Re-uses the same lead action row; does not create a duplicate. Throws on terminal HubSpot failure (the caller decides whether to retry).

```ts
function pushDealForLeadAction(leadActionId: number): Promise<string>; // returns deal id
```

## `applyHubspotStageEvent(event)`

Webhook-driven stage update. Called by `POST /api/webhooks/hubspot` once per change event in a HubSpot batch. Idempotent on `(hubspot_deal_id, hubspot_event_id)`.

```ts
interface HubspotStageEvent {
  dealId: string;        // HubSpot's objectId
  newStageId: string;    // HubSpot's propertyValue (the new stage id)
  eventId: string;       // HubSpot's eventId, used for replay idempotency
  occurredAt: number;    // ms-epoch
  amount?: number | null;
}

type ApplyStageOutcome =
  | { kind: 'updated'; leadActionId: number; previousStatus: LeadActionStatus; newStatus: LeadActionStatus }
  | { kind: 'replayed'; leadActionId: number }
  | { kind: 'unknown_stage'; stageId: string }
  | { kind: 'unknown_deal'; dealId: string };
```

Outcome semantics:
- **`updated`** — the row's status changed; if `newStatus === 'closed_won'`, `closed_won_at` and `closed_won_amount` are stamped (HubSpot's amount preferred, attested fallback).
- **`replayed`** — the same `eventId` was already processed; row is unchanged.
- **`unknown_stage`** — HubSpot reported a stage id Pathfinder doesn't map; row is unchanged, audit-logged.
- **`unknown_deal`** — HubSpot reported a deal id Pathfinder doesn't own; row is unchanged, audit-logged.

## `recordLocalAction(input)`

Records `dismissed` or `snoozed` actions that never round-trip to HubSpot.

```ts
interface RecordLocalActionInput {
  projectId: string;
  actorEmail: string;
  status: 'dismissed' | 'snoozed';
  note?: string | null;
}

interface RecordLocalActionResult {
  leadActionId: number;
}
```

## `setHubspotClientForTesting(client | null)`

Test-only seam to inject a stub HubSpot client. Pass `null` to clear the override.

```ts
function setHubspotClientForTesting(client: HubspotClient | null): void;
```

## Audit log

Every public function audit-logs to `pathfinder.agent_log` with `agent_name='hubspot-sync'`. Event types in use:

- `accept_recorded` — accept persisted, push starting
- `accept_failed` — upsert into lead_actions failed
- `deal_pushed` — HubSpot deal create succeeded
- `deal_push_failed` — HubSpot deal create failed (terminal)
- `note_attach_failed` — deal pushed but note attach failed (non-terminal)
- `rate_limited` — HubSpot 429 received during a request
- `hubspot_5xx` — HubSpot 5xx received during a request
- `stage_event` — webhook drove a status change
- `stage_event_unknown_deal` — webhook referenced a deal we don't own
- `stage_unknown` — webhook referenced a stage id we don't map
- `stage_replayed_skip` — webhook event id was already processed
- `local_action` — dismissed or snoozed action recorded
- `signature_failed` — webhook signature verification failed

## Required environment variables

| Var                            | Required for                          | Notes                                                   |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------- |
| `HUBSPOT_API_KEY`              | All outbound HubSpot calls            | HubSpot Private App token (Bearer)                      |
| `HUBSPOT_APP_SECRET`           | Webhook signature verification        | The HubSpot Private App secret; HMAC-SHA256 key for v3  |
| `HUBSPOT_DEAL_PIPELINE_ID`     | Deal create                           | The portal-specific deal pipeline id                    |
| `HUBSPOT_STAGE_ACCEPTED_ID`    | Deal create                           | The "Lead pushed from Pathfinder" stage id              |
| `HUBSPOT_STAGE_MEETING_ID`     | Webhook → meeting_booked              | Optional; missing means HubSpot moves don't reflect     |
| `HUBSPOT_STAGE_PROPOSAL_ID`    | Webhook → proposal_sent               | Optional                                                |
| `HUBSPOT_STAGE_WON_ID`         | Webhook → closed_won                  | Optional                                                |
| `HUBSPOT_STAGE_LOST_ID`        | Webhook → closed_lost                 | Optional                                                |
| `HUBSPOT_WEBHOOK_PUBLIC_URL`   | Webhook signature verification (opt.) | Override the URI used in the HMAC string when behind a proxy |
| `NEXT_PUBLIC_BASE_URL`         | Note body deep-link                   | Optional; falls back to a relative path                 |
| `CRON_SECRET`                  | `/api/hubspot/push-deal` auth         | Same value used by app/api/cron/* routes                |
| `SUPABASE_SERVICE_ROLE_KEY`    | All writes                            | Existing env, no change                                 |
