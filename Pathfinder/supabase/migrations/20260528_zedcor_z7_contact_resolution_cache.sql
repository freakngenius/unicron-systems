-- 20260528_zedcor_z7_contact_resolution_cache.sql
--
-- Sprint Z7 — Contact Resolver (Hunter / Apollo / email-pattern fallback).
-- Purely additive: two new tables under the pathfinder.* schema, no
-- modifications to existing rows.
--
--   1. pathfinder.contact_resolution_cache
--      90-day cache keyed by (company_name, source). Lets a re-run of
--      the resolver skip the API call when we already have a recent hit,
--      and lets the backfill script run idempotently.
--
--   2. pathfinder.api_usage_log
--      Per-provider usage counters used to throttle Hunter (25/mo free
--      tier) and Apollo (60 credits/mo free tier) at 80% of monthly
--      quota. Spec §"Soft caps".
--
-- Spec: Specs/SPEC-zedcor-z7-contact-resolver.md §"File ownership" +
--       §"Soft caps".

CREATE TABLE IF NOT EXISTS pathfinder.contact_resolution_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  text NOT NULL,
  domain        text,
  contact_name  text,
  contact_email text,
  contact_role  text,
  source        text NOT NULL CHECK (source IN ('hunter', 'apollo', 'pattern')),
  confidence    double precision,
  cached_at     timestamptz NOT NULL DEFAULT now()
);

-- Lookup key: most queries land here filtering by lowercased company name.
CREATE INDEX IF NOT EXISTS contact_resolution_cache_company_idx
  ON pathfinder.contact_resolution_cache (lower(company_name), cached_at DESC);

-- TTL sweeps key off cached_at.
CREATE INDEX IF NOT EXISTS contact_resolution_cache_cached_at_idx
  ON pathfinder.contact_resolution_cache (cached_at);

CREATE TABLE IF NOT EXISTS pathfinder.api_usage_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL,  -- 'hunter' | 'apollo' | other future providers
  units       integer NOT NULL DEFAULT 1,  -- requests for hunter, credits for apollo
  called_at   timestamptz NOT NULL DEFAULT now(),
  context     jsonb  -- optional metadata (project_id, run_id, etc.)
);

-- Hot path: "how many units did we consume this month for provider X?"
CREATE INDEX IF NOT EXISTS api_usage_log_provider_called_at_idx
  ON pathfinder.api_usage_log (provider, called_at DESC);
