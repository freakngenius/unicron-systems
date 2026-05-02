# Operator todo — HubSpot end-to-end setup (Gate 4B-1 → 4B-3)

Created 2026-05-02 by the Demo Polish UX Sprint. Owned by Kyle. Required
for the Tuesday 2026-05-05 Zedcor demo HubSpot bidirectional flow.

The code is in place after Gate 4B-1 ships:
- `app/api/connectors/[type]/webhook` accepts HubSpot v3 webhooks with
  HMAC-SHA256 signature verification (`x-hubspot-signature-v3` +
  `x-hubspot-request-timestamp`).
- Inbound events recorded to `pathfinder.connector_audit_log` with
  `direction='inbound'` and `event_type='inbound.<subscriptionType>'`.
- `lib/connectors/hubspot/outbound.ts` `pushDealStageChange()` is callable
  from any Pathfinder write path; it resolves the active connector,
  loads the stored OAuth token, PATCHes the HubSpot deal, and audit-logs
  every attempt with the token redacted to first-4 + last-4 chars.

Below is the Kyle-side checklist to make this functional in production.

---

## 1. HubSpot app — production mode

**HubSpot Developer Dashboard → Apps → Pathfinder Production.**

- [ ] App is in *production* mode (not development).
- [ ] Auth tab → Redirect URLs include
      `https://pathfinder.unicron.systems/pathfinder/api/connectors/hubspot/callback`.
- [ ] Auth tab → Required scopes:
      - `crm.objects.deals.read`
      - `crm.objects.deals.write`
      - `crm.objects.contacts.read`
      - `crm.objects.contacts.write`
      - `crm.engagements.read`
      - `crm.engagements.write`
      - `crm.schemas.deals.read`
      - `crm.schemas.contacts.read`
- [ ] **Do NOT add Marketing Hub or custom-object scopes.** Those expand
      the auth boundary past Phase 3D and trigger the hard-halt rule.

## 2. Webhook subscriptions

**HubSpot Developer Dashboard → Apps → Pathfinder Production → Webhooks.**

- [ ] Target URL:
      `https://pathfinder.unicron.systems/pathfinder/api/connectors/hubspot/webhook`
- [ ] Subscriptions enabled:
      - `deal.creation`
      - `deal.propertyChange` — restrict properties to
        `dealstage`, `amount`, `closedate`, `dealname`,
        `pathfinder_lead_id`. Wider subscription is wasteful and
        increases the audit-log volume.
      - `deal.deletion`
      - `contact.creation`
      - `contact.propertyChange` — properties:
        `email`, `firstname`, `lastname`, `company`, `lifecyclestage`.
      - `contact.deletion`
      - `engagement.creation`
- [ ] Webhook signing version: **v3** (HubSpot's default for new apps).

## 3. Vercel env vars

**Vercel project `pathfinder` → Environment Variables → Production.**

- [ ] `HUBSPOT_CLIENT_ID` — from HubSpot app's Auth tab.
- [ ] `HUBSPOT_CLIENT_SECRET` — same place; used during OAuth code
      exchange.
- [ ] `HUBSPOT_APP_SECRET` — HubSpot calls this the *Client secret* in
      some screens; it's the same value used to HMAC the webhook
      signature. (NB: the prompt said `HUBSPOT_WEBHOOK_SECRET`; the
      existing codebase uses `HUBSPOT_APP_SECRET` since C-3A and Gate
      4B-1 keeps that naming for compatibility.)
- [ ] `HUBSPOT_DEAL_PIPELINE_ID` — pipeline id from
      `https://api.hubapi.com/crm/v3/pipelines/deals`.
- [ ] `HUBSPOT_STAGE_ACCEPTED_ID` …
      `HUBSPOT_STAGE_LOST_ID` — five stage ids from the same pipeline,
      one per Pathfinder funnel stage. See `lib/hubspot/stage-map.ts`
      for the canonical mapping.
- [ ] `HUBSPOT_WEBHOOK_PUBLIC_URL` (informational, used by docs) =
      `https://pathfinder.unicron.systems/pathfinder/api/connectors/hubspot/webhook`.

After saving env vars, **redeploy** the Pathfinder Vercel project so the
new values are picked up. (Vercel does not hot-reload env vars on a
running deployment.)

## 4. End-to-end smoke

After OAuth + env vars are live in production:

1. From the Settings → Connectors UI, click **Connect** on the HubSpot
   tile. Grant scopes in the HubSpot consent screen.
2. Confirm the tile flips to **Connected** with the portal name
   (e.g. `Zedcor Production`). The bulk-sync runs once on first connect.
3. In HubSpot, manually create a deal in the Pathfinder pipeline.
   Within ~30 seconds, it should appear in
   `pathfinder.connector_audit_log` with
   `event_type = 'inbound.deal.creation'` and the portal id matching
   `connectors.account_external_id`.
4. In Pathfinder, accept a high-score lead (Pathfinder side writes to
   `lead_actions`). The existing `app/api/hubspot/push-deal` route fires
   on accept; the deal should appear in HubSpot with
   `pathfinder_lead_id` set.
5. Move the Pathfinder deal stage (Gate 4B-2 Kanban). The
   `pushDealStageChange()` outbound helper PATCHes the HubSpot deal.
   `pathfinder.connector_audit_log` records the
   `outbound.deal_stage_change` row with `status='sent'` and a redacted
   token.

## 5. Token leak monitor

The `pushDealStageChange()` audit-logs include only the redacted token
(`abcd****wxyz` shape). If a full HubSpot access token (40+
non-whitespace chars beginning with `CXm` or similar) ever appears in
the audit log payload, that's a hard-halt incident — revert the
deploy + rotate the token.

Quick check after every deploy:

```sql
select payload_summary
from pathfinder.connector_audit_log
where created_at > now() - interval '1 hour'
  and event_type like 'outbound.%'
  and (
    payload_summary::text ~ 'CX[a-zA-Z0-9_-]{40,}' or
    payload_summary::text ~ 'pat-[a-zA-Z0-9-]{40,}'
  )
limit 5;
```

(Empty result = no leaks. Any rows = halt + rotate.)
