-- Wave 4 — Gate 13Z-A. Stripe billing foundation.
--
-- Adds the four tables Stream Z needs to land paid-launch monetization:
--   1. pathfinder.customer_orgs       — minimal tenancy root
--   2. pathfinder.subscriptions       — Stripe subscription state mirror
--   3. pathfinder.billing_events      — append-only Stripe webhook log
--   4. pathfinder.usage_events        — timestamped per-event spend / units ledger
--
-- Schema choices:
--
-- customer_orgs is intentionally MINIMAL. Stream Y (0119_users_teams) will
-- ALTER ADD COLUMN IF NOT EXISTS for richer fields (owner_user_id,
-- billing_email, plan flags). Both streams agreed the (id, name, created_at)
-- triple is the safe intersection. Re-runnable via `create table if not
-- exists` so whichever stream lands first wins idempotently.
--
-- subscriptions mirrors Stripe Subscription state, not the source of truth.
-- Stripe is canonical; this row is a denormalized cache for fast tier /
-- quota lookups without a Stripe API round-trip per request. Webhook handler
-- (13Z-C) keeps it in sync. The `tier` and `status` columns are constrained
-- to match Stripe's documented values + our pricing ladder.
--
-- billing_events is the audit log. stripe_event_id is unique (idempotency
-- guard for at-least-once webhook delivery). payload is the full event jsonb
-- so we can replay or re-process if a downstream side-effect failed.
--
-- usage_events is the spend ledger. One row per billable action (lead
-- enriched, outreach sent, etc). Quota enforcement (13Z-D) sums the rows
-- for the current billing period vs the tier's limit. cost_usd is numeric
-- (12, 6) — six decimals to handle sub-cent provider unit costs.
--
-- NO DROP. NO destructive ALTER. Re-runnable. Additive only.

-- 1. customer_orgs ---------------------------------------------------------

create table if not exists pathfinder.customer_orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- 2. subscriptions ---------------------------------------------------------

create table if not exists pathfinder.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  customer_org_id          uuid not null references pathfinder.customer_orgs(id) on delete cascade,
  stripe_customer_id       text not null,
  stripe_subscription_id   text not null,
  tier                     text not null
    check (tier in ('starter', 'pro', 'enterprise')),
  status                   text not null
    check (status in (
      'trialing', 'active', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    )),
  current_period_end       timestamptz,
  cancel_at                timestamptz,
  trial_ends_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index if not exists subscriptions_stripe_subscription_id_key
  on pathfinder.subscriptions(stripe_subscription_id);

create index if not exists subscriptions_customer_org_id_idx
  on pathfinder.subscriptions(customer_org_id);

create index if not exists subscriptions_status_idx
  on pathfinder.subscriptions(status);

-- One live subscription per org. Soft constraint: `canceled` /
-- `incomplete_expired` rows can co-exist with a new active sub.
create unique index if not exists subscriptions_one_live_per_org_idx
  on pathfinder.subscriptions(customer_org_id)
  where status in ('trialing', 'active', 'past_due');

-- 3. billing_events --------------------------------------------------------

create table if not exists pathfinder.billing_events (
  id                  uuid primary key default gen_random_uuid(),
  stripe_event_id     text not null,
  type                text not null,
  customer_org_id     uuid references pathfinder.customer_orgs(id) on delete set null,
  payload             jsonb not null,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  processing_error    text
);

create unique index if not exists billing_events_stripe_event_id_key
  on pathfinder.billing_events(stripe_event_id);

create index if not exists billing_events_type_idx
  on pathfinder.billing_events(type);

create index if not exists billing_events_received_at_idx
  on pathfinder.billing_events(received_at desc);

create index if not exists billing_events_customer_org_id_idx
  on pathfinder.billing_events(customer_org_id);

-- 4. usage_events ----------------------------------------------------------

create table if not exists pathfinder.usage_events (
  id               uuid primary key default gen_random_uuid(),
  customer_org_id  uuid not null references pathfinder.customer_orgs(id) on delete cascade,
  event_type       text not null,
  cost_usd         numeric(12, 6) not null default 0,
  units            integer not null default 1,
  metadata         jsonb,
  occurred_at      timestamptz not null default now()
);

create index if not exists usage_events_customer_org_occurred_idx
  on pathfinder.usage_events(customer_org_id, occurred_at desc);

create index if not exists usage_events_event_type_idx
  on pathfinder.usage_events(event_type);
