-- 20260528_zedcor_z35_gc_metadata.sql — Sprint Z3.5 detail-page enrichment storage.
--
-- Adds one jsonb column to pathfinder.projects to hold GC + contact extraction
-- results plus provenance. Strictly additive; idempotent; safe to re-run.
--
-- gc_metadata jsonb keys (when populated):
--   gc_name                 string | null   prime contractor awarded
--   gc_award_date           YYYY-MM-DD | null
--   gc_contact_name         string | null   PM / subcontract admin AT the GC
--   gc_contact_role         string | null
--   gc_contact_email        string | null
--   gc_contact_phone        string | null   +1-XXX-XXX-XXXX
--   sub_bid_deadline        YYYY-MM-DD | null
--   subcontract_package_url string | null
--   fetched_at              ISO timestamp   set on every enrichment attempt
--   fetch_status            'ok'|'gated'|'timeout'|'http_error'|'no_source_url'|'robots_disallowed'
--   extraction_layer        'html'|'anthropic'|'sonar'|'mixed'|'none'
--   source_citation         string | null   URL or note from sonar fallback
--
-- Hard rule: never store full detail-page HTML in this column (privacy + size).
-- Only extracted fields + provenance.

begin;

alter table pathfinder.projects
  add column if not exists gc_metadata jsonb not null default '{}'::jsonb;

create index if not exists projects_gc_metadata_gc_name_idx
  on pathfinder.projects ((gc_metadata->>'gc_name'))
  where gc_metadata ? 'gc_name';

create index if not exists projects_gc_metadata_fetched_at_idx
  on pathfinder.projects (((gc_metadata->>'fetched_at')::timestamptz) desc nulls last)
  where gc_metadata ? 'fetched_at';

comment on column pathfinder.projects.gc_metadata is
  'Sprint Z3.5 GC + contact extraction result and fetch provenance. Keys: gc_name, gc_award_date, gc_contact_name, gc_contact_role, gc_contact_email, gc_contact_phone, sub_bid_deadline, subcontract_package_url, fetched_at, fetch_status, extraction_layer (html|anthropic|sonar|mixed|none), source_citation. Never stores raw HTML.';

commit;

-- Post-migration sanity probes:
--   select count(*) from pathfinder.projects where gc_metadata <> '{}'::jsonb;
--   select gc_metadata->>'extraction_layer' as layer, count(*) from pathfinder.projects where gc_metadata ? 'fetched_at' group by 1;
