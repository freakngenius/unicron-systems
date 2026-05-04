# Pathfinder needs `organizations` schema (multi-clustomer persistence)

**Date:** 2026-05-04
**Owner:** Pathfinder chat
**Caller:** Metacron operator (Kyle)
**Escalation deadline:** 2026-05-05 (24h from peer ping)

## Why

Real Architect "Approve & Deploy" flow currently produces zero durable state. Investigation 2026-05-04 confirmed:

- `pathfinder.organizations` does **not** exist. `pathfinder.customers` exists but is a branch/coverage table (`lat`, `lon`, `monthly_value`) — wrong shape for onboarded clustomer records.
- `handleApprove` in `unicron-platform/src/components/onboarding/ArchitectThinking.tsx:87-89` only calls `onApprove(config)` → `Onboarding.tsx:34-39` `deploy(config)` → `setConfig((prev) => ({...prev, ...next}))`. Pure React state. No fetch, no DB write.
- Metacron Customers tab (`src/views/CustomersView.tsx` → `customersClient.listCustomerOrgs`) is hardcoded to a single Zedcor row regardless of `VITE_PATHFINDER_DB_ENABLED`.
- No `/api/organizations` route exists in metacron.
- `unicron.agent_dispatches.customer_org_id` is `text NOT NULL`, no FK — tenant discriminator string only.

Net effect: every new clustomer the Architect "deploys" vanishes on refresh. Demo blocker for multi-tenant story.

## Asked of Pathfinder

### 1. Migration: create `pathfinder.organizations`

```sql
CREATE TABLE pathfinder.organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  architecture    jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_org_id text NOT NULL UNIQUE, -- matches unicron.agent_dispatches.customer_org_id
  created_by_user_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organizations_slug_idx ON pathfinder.organizations (slug);
CREATE INDEX organizations_customer_org_id_idx ON pathfinder.organizations (customer_org_id);
```

**RLS:**
- `service_role`: full access.
- Operator team JWT (claim `role='operator'` or membership of `unicron-operators` group, whichever matches existing convention): SELECT + INSERT + UPDATE.
- Anon: deny.

**Seed:**
```sql
INSERT INTO pathfinder.organizations (name, slug, customer_org_id, architecture)
VALUES ('Zedcor', 'zedcor', 'zedcor', '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
```
(Replace `'{}'::jsonb` with the existing canonical Zedcor architecture snapshot if you have one — Metacron will accept either.)

### 2. CRUD endpoints

Pathfinder API surface (matching existing route conventions):

- `POST /api/organizations` — body `{ name, slug, customer_org_id, architecture }` → returns inserted row. Slug uniqueness enforced at DB; respond `409` on conflict.
- `GET /api/organizations` — list. Operator-scoped.
- `GET /api/organizations/:slug` — one. (slug, not id, to match URL param `/customers/:slug`.)
- `PATCH /api/organizations/:slug` — partial update of `name` / `architecture`. Updates `updated_at`.

CORS: must accept Metacron origins (`https://metacron.vercel.app` + preview deploys).

## Metacron side — already in flight

Branch `chore/metacron-multi-clustomer-persistence` (PR opening 2026-05-04). Adds:

- Dynamic Customers list fetch
- Onboarding persistence on Approve & Deploy
- Name + slug fields in APPROVE modal
- Slug-keyed routing (`/customers/:slug`)

Persistence gated behind `VITE_CUSTOMER_PERSISTENCE_ENABLED` (default off). Flip to `true` on Vercel once Pathfinder lands the migration + endpoints.

## Status

- [ ] Pathfinder migration shipped
- [ ] `/api/organizations` POST live
- [ ] `/api/organizations` GET list live
- [ ] `/api/organizations/:slug` GET live
- [ ] `/api/organizations/:slug` PATCH live
- [ ] Zedcor seed row present
- [ ] Metacron `VITE_CUSTOMER_PERSISTENCE_ENABLED=true` on prod
