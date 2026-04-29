# HubSpot sandbox setup

Step-by-step for landing a HubSpot account that Pathfinder can talk to. Do this **once** per environment (local dev, Vercel preview, Vercel prod). Pathfinder uses HubSpot's free CRM tier as the sandbox during the pilot — full Sales/Marketing Hub features aren't required.

## 1. Create the HubSpot account

1. Go to https://app.hubspot.com/signup-hubspot/crm and sign up with your operator email (`kyle@demystified.ai`).
2. Skip the marketing/onboarding flow; click straight through to the dashboard.
3. Note the portal ID (top-right corner, click your avatar → "Account & Billing"). Save it as `HUBSPOT_PORTAL_ID` if you want it for log diagnostics; the integration itself does not require it.

## 2. Create a Private App

A Private App is the HubSpot construct that gives Pathfinder a stable Bearer token + a webhook signing secret.

1. Settings (gear icon) → **Integrations** → **Private apps** → **Create a private app**.
2. **Name:** "Pathfinder" — the value shows up on every API request and is also on the audit log of any rep who looks at HubSpot's audit trail.
3. **Scopes** tab — enable:
   - `crm.objects.deals.read`
   - `crm.objects.deals.write`
   - `crm.schemas.deals.write` (needed to create the `pathfinder_lead_id` custom property — see step 4)
   - `crm.objects.notes.write`
4. **Webhooks** tab — enable. Target URL: `https://<your-vercel-domain>/api/webhooks/hubspot`. Subscribe to the **Deal property change → `dealstage`** event. (For prod: the Vercel project's prod URL. For preview: the preview deployment URL — webhooks against preview deploys are fine for live integration testing but the URL changes per deploy, so use the production URL for the pilot.)
5. Click **Create app**. HubSpot shows the **Access token** and a **Client secret** on the next screen.
   - Access token → drop into env as `HUBSPOT_API_KEY`.
   - Client secret → drop into env as `HUBSPOT_APP_SECRET`. (This is the value used by HubSpot's v3 webhook signature; the env name reflects what the value actually is, not what it gates.)
6. Both values surface only once. If you forget to copy them, regenerate from the same private-app page (rotate, then update env).

## 3. Identify the deal pipeline + stage IDs

The default HubSpot deal pipeline is fine for the pilot. To enumerate the stage IDs:

```bash
curl -s -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  https://api.hubapi.com/crm/v3/pipelines/deals \
  | jq '.results[] | {pipeline_id: .id, label: .label, stages: [.stages[] | {label: .label, id: .stageId}]}'
```

Pick the pipeline you want Pathfinder to write into. For the default pipeline, the stage IDs are typically:

| HubSpot label                   | Stage ID (default pipeline) | Pathfinder env var          |
| ------------------------------- | --------------------------- | --------------------------- |
| Appointment scheduled           | `appointmentscheduled`      | `HUBSPOT_STAGE_MEETING_ID`  |
| Qualified to buy                | `qualifiedtobuy`            | (unused — no map entry)     |
| Presentation scheduled          | `presentationscheduled`     | (unused — no map entry)     |
| Decision maker bought-in        | `decisionmakerboughtin`     | (unused — no map entry)     |
| Contract sent                   | `contractsent`              | `HUBSPOT_STAGE_PROPOSAL_ID` |
| Closed won                      | `closedwon`                 | `HUBSPOT_STAGE_WON_ID`      |
| Closed lost                     | `closedlost`                | `HUBSPOT_STAGE_LOST_ID`     |

The default pipeline doesn't have a "Lead pushed from Pathfinder" stage. Either:
- **A.** Add a custom stage to the default pipeline at position 1 ("Lead pushed from Pathfinder"). Use its returned `stageId` for `HUBSPOT_STAGE_ACCEPTED_ID`.
- **B.** Re-use the existing `appointmentscheduled` stage. Set `HUBSPOT_STAGE_ACCEPTED_ID = appointmentscheduled` and `HUBSPOT_STAGE_MEETING_ID` to a different stage you don't otherwise use, e.g. `qualifiedtobuy`.

For the Zedcor pilot, **option A** is preferred — it makes Pathfinder-sourced deals visually distinct in HubSpot's pipeline view.

Save the IDs:

```bash
HUBSPOT_DEAL_PIPELINE_ID=default
HUBSPOT_STAGE_ACCEPTED_ID=<from option A or B above>
HUBSPOT_STAGE_MEETING_ID=appointmentscheduled
HUBSPOT_STAGE_PROPOSAL_ID=contractsent
HUBSPOT_STAGE_WON_ID=closedwon
HUBSPOT_STAGE_LOST_ID=closedlost
```

## 4. Create the `pathfinder_lead_id` custom property

Pathfinder stamps every deal with a `pathfinder_lead_id` custom property. The property must exist on the deal object before any push will succeed.

`lib/hubspot/client.ts:ensureCustomProperty` handles this idempotently. Run it once after env is configured:

```bash
curl -X POST "https://api.hubapi.com/crm/v3/properties/deals" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "pathfinder_lead_id",
    "label": "Pathfinder Lead ID",
    "description": "The pathfinder.lead_actions.id this deal was pushed from. Pathfinder-managed.",
    "groupName": "dealinformation",
    "type": "string",
    "fieldType": "text"
  }'
```

A 201 means it was created. A 409 means it already exists (idempotent — safe to ignore).

Repeat for the secondary attribution properties Pathfinder uses:

```bash
# pathfinder_branch_code (string)
# pathfinder_score (string)
# pathfinder_warm_customer (string)
# pathfinder_dashboard_url (string)
```

(All four follow the same shape; substitute the `name`, `label`, and `description`.)

## 5. Drop env vars into Vercel

`vercel env add` for each, scoped to **Production** + **Preview** + **Development**:

```bash
HUBSPOT_API_KEY            # Bearer token from step 2
HUBSPOT_APP_SECRET         # Client secret from step 2
HUBSPOT_DEAL_PIPELINE_ID   # From step 3
HUBSPOT_STAGE_ACCEPTED_ID  # From step 3
HUBSPOT_STAGE_MEETING_ID   # From step 3
HUBSPOT_STAGE_PROPOSAL_ID  # From step 3
HUBSPOT_STAGE_WON_ID       # From step 3
HUBSPOT_STAGE_LOST_ID      # From step 3
```

Mirror in `.env.local` for local development.

## 6. Live end-to-end test (pre-merge gate)

After step 5 and after migration `0011_hubspot_sync.sql` is applied to the production Supabase project:

1. Pick a real `pathfinder.projects` row to use as the test target. (Or insert a synthetic one with a tagged id like `_e2e_test_<ts>`.)
2. Call the push endpoint with `curl`:
   ```bash
   curl -X POST "https://<vercel-domain>/api/hubspot/push-deal" \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H "content-type: application/json" \
     -d '{
       "project_id": "<the project id>",
       "actor_email": "kyle@demystified.ai",
       "attested_pipeline_value": 25000,
       "first_action_date": "2026-05-01",
       "note": "live e2e test"
     }'
   ```
3. Eyeball: a deal with the test name appears in HubSpot's pipeline view at the "Lead pushed from Pathfinder" stage within ~30 seconds.
4. In HubSpot, drag the deal to "Appointment scheduled". Wait ~30 seconds.
5. Query Supabase:
   ```sql
   select id, status, hubspot_deal_id, hubspot_last_event_id, hubspot_last_event_at
     from pathfinder.lead_actions
    where actor_email = 'kyle@demystified.ai'
    order by updated_at desc
    limit 5;
   ```
   Expect `status` to be `meeting_booked` and `hubspot_last_event_at` populated.
6. Drag the deal to "Closed won". Wait ~30 seconds. Re-query: expect `status='closed_won'` and `closed_won_amount=25000` (the attested fallback, since HubSpot didn't set an amount).
7. Clean up the test row in HubSpot (delete the deal) and Pathfinder (`delete from pathfinder.lead_actions where actor_email='kyle@demystified.ai' and project_id='<test project id>'`).

## 7. Rotate the secret

When the pilot ends or staff change, rotate the Private App secret:

1. HubSpot → Settings → Private apps → Pathfinder → "Rotate secret".
2. Update `HUBSPOT_APP_SECRET` in Vercel envs.
3. Redeploy or use `vercel env pull` locally to refresh `.env.local`.

The token (`HUBSPOT_API_KEY`) rotates the same way; HubSpot allows the old token to coexist for a short overlap window so you can swap with no outage.
