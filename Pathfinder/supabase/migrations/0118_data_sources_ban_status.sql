-- Migration 0118 — pathfinder.data_sources.ban_status
--
-- Wave 2 Stream W2-C: operator can ban / unban a source. Banned sources are
-- excluded from active ingestion lists (filter applied at the query site;
-- see follow-up operator-todo for ingestion call-site updates if any).
--
-- Additive + idempotent: adds a single column with a default and a check
-- constraint. Re-running the migration is a no-op via `if not exists`.

alter table pathfinder.data_sources
  add column if not exists ban_status text not null default 'active'
  check (ban_status in ('active', 'banned'));

create index if not exists data_sources_ban_status_idx
  on pathfinder.data_sources (ban_status);
