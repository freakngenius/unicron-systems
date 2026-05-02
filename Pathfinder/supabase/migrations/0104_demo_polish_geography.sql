-- Demo Polish Stream P1 — geography filtering.
--
-- Additive-only migration backing the SPEC § 2 geography enforcement:
--   Layer A (ingest filter)    → rejection_reason = 'out_of_country'
--   Layer B (coord enforcement) → geo_unknown + geo_inference_confidence
--   Layer C (distance gating)  → rejection_reason = 'no_branch_coverage'
--
-- New per-org configuration table holds the distance threshold and the
-- allowed-country whitelist. Default is 250mi US/CAN — Zedcor today.
--
-- Idempotent: every change uses IF NOT EXISTS so re-applying is safe.

alter table pathfinder.projects
  add column if not exists country text,
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists geo_unknown boolean default false,
  add column if not exists geo_inference_confidence numeric(3,2);

-- Index the rejection_reason since the rejected pile + lead-list filters
-- read by it on every render. Partial index keeps it tight (qualified
-- rows have a NULL rejection_reason and don't need indexing).
create index if not exists projects_rejection_reason_idx
  on pathfinder.projects (rejection_reason)
  where rejection_reason is not null;

create table if not exists pathfinder.org_geo_config (
  org_id text primary key,
  max_supported_distance_miles integer not null default 250,
  allowed_countries text[] not null default array['USA', 'CAN'],
  updated_at timestamptz not null default now()
);

insert into pathfinder.org_geo_config (org_id) values ('zedcor')
on conflict do nothing;
