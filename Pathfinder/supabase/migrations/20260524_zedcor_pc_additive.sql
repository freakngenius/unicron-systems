-- 20260524_zedcor_pc_additive.sql — Zedcor PC variant, additive only.
--
-- This migration adds the minimum schema needed to run the Zedcor PC agent
-- variant (Perplexity Computer-driven ingestor + verifier + customer-intel)
-- alongside the existing Vercel-cron Pathfinder system. NOTHING in this
-- migration alters or drops existing data, constraints, or behavior.
--
-- New surfaces:
--   1. pathfinder.projects                  — 3 additive columns
--                                              (phase_confidence, phase_signals, buy_window_open)
--   2. pathfinder.hubs                      — new table (multi-city scaffold)
--   3. pathfinder.source_licenses           — new table (per-source ToS posture)
--   4. pathfinder.customer_signals          — new table (customer-intel writes)
--   5. pathfinder.agent_log                 — 1 additive column (runner)
--   6. pathfinder.agent_runs                — 1 additive column (runner)
--
-- The agent_name CHECK constraint is NOT widened. PC agents use the existing
-- legal names ('ingestor', 'verifier', 'customer-intel') and self-identify
-- via the new `runner` column ('cron' | 'pc').
--
-- Idempotent: every CREATE / ALTER uses IF NOT EXISTS or IF EXISTS guards.
-- Safe to re-run.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. pathfinder.projects — additive phase-inference columns
-- ─────────────────────────────────────────────────────────────────────────
-- project_stage (existing text column) already carries human-readable phase.
-- These three columns add the structured, machine-readable phase output the
-- PC Verifier writes. The dashboard treats them as optional (NULL = unknown).

alter table pathfinder.projects
  add column if not exists phase_confidence numeric(4,3),       -- 0.000–1.000
  add column if not exists phase_signals    text[],              -- which signal patterns fired
  add column if not exists buy_window_open  boolean;             -- derived from phase_signals + project_stage

alter table pathfinder.projects
  add constraint if not exists projects_phase_confidence_range_check
  check (phase_confidence is null or (phase_confidence >= 0 and phase_confidence <= 1));

create index if not exists projects_buy_window_open_idx
  on pathfinder.projects(buy_window_open, phase_confidence desc nulls last)
  where buy_window_open is true;

comment on column pathfinder.projects.phase_confidence is
  'PC Verifier output. 0–1 confidence that project_stage is correct. NULL = not yet phase-mapped.';
comment on column pathfinder.projects.phase_signals is
  'PC Verifier output. Array of signal-pattern slugs that triggered the phase inference.';
comment on column pathfinder.projects.buy_window_open is
  'PC Verifier output. Derived: true when project_stage is gc_selected, sub_bid, or mobilization_late_actionable.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. pathfinder.hubs — multi-city scaffold
-- ─────────────────────────────────────────────────────────────────────────
-- Hubs are how a single organization scales across geographies without
-- spawning new orgs. Houston is hub #1 for Zedcor. Future hubs (Dallas,
-- Phoenix, etc.) are config + a source-list, not a new Space.

create table if not exists pathfinder.hubs (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references pathfinder.organizations(id) on delete cascade,
  hub_slug        text        not null,                          -- 'houston', 'dallas'
  display_name    text        not null,                          -- 'Houston', 'Dallas'
  status          text        not null default 'pending',
  center_lat      numeric(9,6),
  center_lon      numeric(9,6),
  radius_miles    integer     not null default 300,
  geofence_states text[]      not null default '{}'::text[],
  config          jsonb       not null default '{}'::jsonb,
  go_live_date    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint hubs_status_check check (status in ('pending','live','paused')),
  constraint hubs_org_slug_unique unique (organization_id, hub_slug)
);

create index if not exists hubs_org_status_idx on pathfinder.hubs(organization_id, status);

alter table pathfinder.hubs enable row level security;

drop policy if exists hubs_read_all on pathfinder.hubs;
create policy hubs_read_all on pathfinder.hubs for select to anon, authenticated using (true);

drop policy if exists hubs_write_service on pathfinder.hubs;
create policy hubs_write_service on pathfinder.hubs for all to service_role using (true) with check (true);

comment on table pathfinder.hubs is
  'Per-organization geographic hubs. Pathfinder PC variant uses hubs to scope ingestion. Adding a hub is config-only, no new Space.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. pathfinder.source_licenses — per-source ToS posture
-- ─────────────────────────────────────────────────────────────────────────
-- Each row in pathfinder.data_sources gets a license posture, classifying
-- whether Unicron (as an aggregator) may lawfully fetch and redistribute
-- via the customer (Zedcor) tenant. The PC ingestor reads this table at
-- run start and skips any source not classified commercial_ok.

create table if not exists pathfinder.source_licenses (
  id                  uuid        primary key default gen_random_uuid(),
  source_slug         text        not null unique,                -- matches data_sources slug or our seed slug
  source_url          text        not null,
  license_status      text        not null default 'legal_review',
  classification_basis text,                                       -- 'public_records_statute' | 'open_api_tos' | 'tos_prohibits_aggregation' | 'login_walled' | 'manual'
  last_classified_at  timestamptz not null default now(),
  classified_by       text        not null default 'manual',       -- 'manual' | 'pc-license-checker'
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint source_licenses_status_check
    check (license_status in ('commercial_ok','agency_direct_required','legal_review','blocked'))
);

create index if not exists source_licenses_status_idx on pathfinder.source_licenses(license_status);

alter table pathfinder.source_licenses enable row level security;

drop policy if exists source_licenses_read_all on pathfinder.source_licenses;
create policy source_licenses_read_all on pathfinder.source_licenses for select to anon, authenticated using (true);

drop policy if exists source_licenses_write_service on pathfinder.source_licenses;
create policy source_licenses_write_service on pathfinder.source_licenses for all to service_role using (true) with check (true);

comment on table pathfinder.source_licenses is
  'Per-source ToS classification. PC ingestor reads at run start; skips any source not commercial_ok. Submission posture: 50+ public sources commercial_ok, walled sources agency_direct_required (customer-side connector — Phase 2).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. pathfinder.customer_signals — PC customer-intel writes
-- ─────────────────────────────────────────────────────────────────────────
-- Customer Intel (PC variant) watches Zedcor's existing customers from
-- pathfinder.zedcor_customer_sites (which already exists) for public signals
-- (M&A, expansion, hiring, incidents) and writes opportunity inferences here.

create table if not exists pathfinder.customer_signals (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null references pathfinder.organizations(id) on delete cascade,
  customer_site_id      uuid        references pathfinder.zedcor_customer_sites(id) on delete set null,
  customer_name         text        not null,                      -- denormalized for orgs without zedcor_customer_sites
  signal_type           text        not null,                      -- 'expansion'|'m_and_a'|'hiring'|'incident'|'filing'|'press'
  signal_data           jsonb       not null default '{}'::jsonb,  -- raw evidence + parsed entities
  inferred_opportunity  text,
  opportunity_window    text,                                       -- 'immediate'|'30-60d'|'60-90d'|'90-180d'|'unknown'
  source_url            text        not null,
  confidence            numeric(4,3),                               -- 0–1
  observed_at           timestamptz not null default now(),
  agent_run_id          bigint      references pathfinder.agent_runs(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint customer_signals_type_check
    check (signal_type in ('expansion','m_and_a','hiring','incident','filing','press','other')),
  constraint customer_signals_window_check
    check (opportunity_window is null or opportunity_window in ('immediate','30-60d','60-90d','90-180d','unknown')),
  constraint customer_signals_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists customer_signals_org_observed_idx
  on pathfinder.customer_signals(organization_id, observed_at desc);
create index if not exists customer_signals_customer_idx
  on pathfinder.customer_signals(customer_site_id) where customer_site_id is not null;

-- Soft dedup: same customer + same source_url within 30 days = duplicate.
create unique index if not exists customer_signals_dedup_idx
  on pathfinder.customer_signals(organization_id, customer_name, source_url);

alter table pathfinder.customer_signals enable row level security;

drop policy if exists customer_signals_read_all on pathfinder.customer_signals;
create policy customer_signals_read_all on pathfinder.customer_signals for select to anon, authenticated using (true);

drop policy if exists customer_signals_write_service on pathfinder.customer_signals;
create policy customer_signals_write_service on pathfinder.customer_signals for all to service_role using (true) with check (true);

comment on table pathfinder.customer_signals is
  'PC Customer Intel agent output. Public signals about Zedcor customers (M&A, expansion, hiring, incidents, filings, press). One row per detected event.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5–6. pathfinder.agent_log + agent_runs — runner column
-- ─────────────────────────────────────────────────────────────────────────
-- Distinguishes PC agent runs from existing Vercel cron runs without
-- touching the agent_name CHECK constraint. Default 'cron' so all existing
-- rows backfill cleanly.

alter table pathfinder.agent_log
  add column if not exists runner text not null default 'cron';
alter table pathfinder.agent_log
  add constraint if not exists agent_log_runner_check
  check (runner in ('cron','pc','manual'));
create index if not exists agent_log_runner_idx
  on pathfinder.agent_log(runner, ts desc);

alter table pathfinder.agent_runs
  add column if not exists runner text not null default 'cron';
alter table pathfinder.agent_runs
  add constraint if not exists agent_runs_runner_check
  check (runner in ('cron','pc','manual'));
create index if not exists agent_runs_runner_started_idx
  on pathfinder.agent_runs(runner, started_at desc);

comment on column pathfinder.agent_log.runner is
  'Execution surface. cron = Vercel scheduled function; pc = Perplexity Computer Space agent; manual = operator-triggered.';
comment on column pathfinder.agent_runs.runner is
  'Execution surface. cron = Vercel scheduled function; pc = Perplexity Computer Space agent; manual = operator-triggered.';

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- Post-migration sanity probes (run manually after commit):
-- ─────────────────────────────────────────────────────────────────────────
--   select count(*) from pathfinder.projects where phase_confidence is null;
--   select count(*) from pathfinder.hubs;
--   select count(*) from pathfinder.source_licenses;
--   select count(*) from pathfinder.customer_signals;
--   select runner, count(*) from pathfinder.agent_runs group by 1;
--   select runner, count(*) from pathfinder.agent_log group by 1;
