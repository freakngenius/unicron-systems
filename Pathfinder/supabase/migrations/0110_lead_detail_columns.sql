-- Demo Polish UX Sprint — Gate 3A.
--
-- Adds the 10 lead-detail fields from `00 - TUESDAY DEMO PLAN.md` CRITICAL #8
-- to `pathfinder.projects`. Fields not already present are added here as
-- nullable, additive columns. Spec: `Company Docs/Specs/SPEC - Lead Detail
-- Enrichment.md`.
--
-- Existing columns that already cover demo fields:
--   project_value  → field #9 (estimated cost)
--   lat, lon       → field #6 (GPS coordinates)
--   summary        → fallback for field #4 (project description)
--   posted_date    → posted-date relative reformat in UI (Gate 3D)
--
-- Idempotent: every column is `add column if not exists`. NO DROP, NO
-- destructive ALTER. Safe to re-run.

alter table pathfinder.projects
  add column if not exists owner_name             text,
  add column if not exists owner_type             text,
  add column if not exists prime_contractor_name  text,
  add column if not exists key_subs               jsonb,
  add column if not exists description_long       text,
  add column if not exists naics_code             text,
  add column if not exists naics_description      text,
  add column if not exists location_text          text,
  add column if not exists estimated_start_date   date,
  add column if not exists estimated_end_date     date,
  add column if not exists permit_number          text,
  add column if not exists permit_jurisdiction    text,
  add column if not exists permit_filing_date     date,
  add column if not exists permit_type            text,
  add column if not exists lot_size_acres         numeric,
  add column if not exists enriched_at            timestamptz,
  add column if not exists enrichment_provider    text,
  add column if not exists enrichment_cost_usd    numeric;

comment on column pathfinder.projects.owner_name is
  'Lead owner / developer name. Sources: sam.gov fullParentPathName leaf, usaspending Awarding Agency, harris/news enrichment. Demo field #1.';
comment on column pathfinder.projects.owner_type is
  'Owner-type taxonomy: federal_agency | state_agency | municipality | private_developer | pe_firm | reit | university | nonprofit | other. PE flag for "PE / municipality" demo signal.';
comment on column pathfinder.projects.prime_contractor_name is
  'Prime contractor / awardee. Sources: usaspending Recipient Name (177/183 rows), Sonar enrichment for sam.gov awards + harris contractor_listed=true.';
comment on column pathfinder.projects.key_subs is
  'JSONB array of {name, role?, source_url?}. Sonar-enriched only; never raw_payload. Empty array = enriched-but-none-found.';
comment on column pathfinder.projects.description_long is
  'Verbose project description (2-3 sentences). usaspending Description (177/183), Anthropic summarization for the rest. Distinct from short summary column.';
comment on column pathfinder.projects.naics_code is
  '6-digit NAICS code. sam.gov.naicsCode (260/284), Anthropic classification for usaspending/harris/news.';
comment on column pathfinder.projects.naics_description is
  'Human-readable NAICS sector name. Filled by enrichment lookup table or Anthropic.';
comment on column pathfinder.projects.location_text is
  'Human-readable place of performance (e.g. "Houston, TX"). Distinct from lat/lon. Raw_payload only; never enriched.';
comment on column pathfinder.projects.estimated_start_date is
  'Project start date. sam.gov.responseDeadLine (proxy = bid window opens), harris.filing_date, Sonar enrichment for usaspending POP.';
comment on column pathfinder.projects.estimated_end_date is
  'Project end date. sam.gov.archiveDate (proxy = solicitation close-out), Sonar enrichment for usaspending POP and others.';
comment on column pathfinder.projects.permit_number is
  'City / county permit number. harris.source_id directly; null elsewhere.';
comment on column pathfinder.projects.permit_jurisdiction is
  'Permit issuer (e.g. "Harris County, TX").';
comment on column pathfinder.projects.permit_filing_date is
  'Permit filing date. harris.filing_date; null elsewhere.';
comment on column pathfinder.projects.permit_type is
  'Permit-type label. harris.permit_type (commercial-renovation, etc.).';
comment on column pathfinder.projects.lot_size_acres is
  'Parcel / lot size in acres. Sonar enrichment only; never raw_payload.';
comment on column pathfinder.projects.enriched_at is
  'Timestamp of most recent enrichment pass for this row. Distinguishes "never tried" (null) from "tried but no data found" (not null + nulls in other fields).';
comment on column pathfinder.projects.enrichment_provider is
  'raw_payload_only | sonar | anthropic | sonar+anthropic. Provenance for the enrichment pass.';
comment on column pathfinder.projects.enrichment_cost_usd is
  'Cumulative enrichment USD spend for this row. Aggregated across providers across re-runs.';
