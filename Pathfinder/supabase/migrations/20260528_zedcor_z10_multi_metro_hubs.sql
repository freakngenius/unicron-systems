-- 20260528_zedcor_z10_multi_metro_hubs.sql — Sprint Z10, additive only.
--
-- Seeds three new Zedcor hubs (DFW, Austin, San Antonio) into pathfinder.hubs
-- and inserts the 20 new data_sources rows that pair with the 20 source
-- adapters added under lib/adapters/sources/. Every statement is idempotent:
-- hubs use ON CONFLICT on (organization_id, hub_slug); data_sources uses
-- ON CONFLICT on the synthetic key (name, candidate_url).
--
-- Spec: Specs/SPEC-zedcor-z10-multi-metro.md
-- Owns: pathfinder.hubs rows for dfw/austin/san-antonio, plus 20 data_sources
-- rows. Touches nothing existing.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Hubs — three new rows, all under the Zedcor organization
-- ─────────────────────────────────────────────────────────────────────────
-- Geofence is the same TX/LA/OK/AR set used by the Houston hub. Radius
-- intentionally matches Houston (300 mi) — overlap is fine, the
-- orchestrator de-dups on project_signature.

insert into pathfinder.hubs (
  organization_id, hub_slug, display_name, status,
  center_lat, center_lon, radius_miles, geofence_states,
  go_live_date
)
select
  o.id, v.hub_slug, v.display_name, 'live',
  v.center_lat, v.center_lon, 300, array['TX','LA','OK','AR']::text[],
  current_date
from pathfinder.organizations o
cross join (values
  ('dfw',         'Dallas–Fort Worth', 32.776700::numeric(9,6), -96.797000::numeric(9,6)),
  ('austin',      'Austin',            30.267200::numeric(9,6), -97.743100::numeric(9,6)),
  ('san-antonio', 'San Antonio',       29.424100::numeric(9,6), -98.493600::numeric(9,6))
) as v(hub_slug, display_name, center_lat, center_lon)
where o.slug = 'zedcor'
on conflict (organization_id, hub_slug) do update set
  display_name = excluded.display_name,
  status       = excluded.status,
  center_lat   = excluded.center_lat,
  center_lon   = excluded.center_lon,
  radius_miles = excluded.radius_miles,
  geofence_states = excluded.geofence_states,
  go_live_date = coalesce(pathfinder.hubs.go_live_date, excluded.go_live_date),
  updated_at   = now();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. data_sources — 20 new rows (one per new adapter)
-- ─────────────────────────────────────────────────────────────────────────
-- adapter_kind = 'custom' for the hand-written id-keyed adapters under
-- lib/adapters/sources/. metadata.hub_slug pins each source to a hub for
-- dispatch + dashboards. status = 'live' so the run-orchestrator picks
-- them up on the next run.
--
-- data_sources has no unique constraint on `name` (operator-onboarded rows
-- may legitimately share names), so we guard inserts with NOT EXISTS rather
-- than ON CONFLICT. Re-running the migration is a no-op once the rows exist.

with new_rows(name, candidate_url, jurisdiction, hub_slug) as (values
  -- DFW (8)
  ('fort-worth-city',      'https://www.fortworthtexas.gov/departments/finance/purchasing/bids-current', 'TX-Tarrant',  'dfw'),
  ('arlington-city',       'https://www.arlingtontx.gov/city_hall/departments/financial_services/purchasing/current_bids', 'TX-Tarrant', 'dfw'),
  ('plano-city',           'https://www.plano.gov/189/Purchasing', 'TX-Collin', 'dfw'),
  ('garland-city',         'https://www.garlandtx.gov/162/Purchasing', 'TX-Dallas', 'dfw'),
  ('irving-city',          'https://www.cityofirving.org/372/Purchasing', 'TX-Dallas', 'dfw'),
  ('dallas-isd',           'https://www.dallasisd.org/Page/2243', 'TX-Dallas', 'dfw'),
  ('tarrant-county',       'https://tarrantcounty.bonfirehub.com/portal/?tab=openOpportunities', 'TX-Tarrant', 'dfw'),
  ('dfw-airport',          'https://www.dfwairport.com/business/contracts-and-procurement/', 'TX-Tarrant', 'dfw'),

  -- Austin (4)
  ('austin-eresponse',     'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm', 'TX-Travis', 'austin'),
  ('austin-bergstrom',     'https://www.austintexas.gov/department/austin-bergstrom-international-airport-procurement', 'TX-Travis', 'austin'),
  ('travis-county',        'https://www.traviscountytx.gov/purchasing/solicitations', 'TX-Travis', 'austin'),
  ('ut-system',            'https://www.utsystem.edu/offices/supply-chain-alliance/bid-opportunities', 'TX-Travis', 'austin'),

  -- San Antonio (4)
  ('san-antonio-city',     'https://webapp1.sanantonio.gov/BidContractOpps/Default.aspx', 'TX-Bexar', 'san-antonio'),
  ('bexar-county',         'https://www.bexar.org/Bid', 'TX-Bexar', 'san-antonio'),
  ('san-antonio-airport',  'https://www.sanantonio.gov/aviation/about/contracting', 'TX-Bexar', 'san-antonio'),
  ('northside-isd',        'https://www.nisd.net/departments/purchasing', 'TX-Bexar', 'san-antonio'),

  -- South Texas / Coast (4)
  ('corpus-christi-city',  'https://www.cctexas.com/departments/contracts-and-procurement', 'TX-Nueces', 'san-antonio'),
  ('nueces-county',        'https://www.nuecesco.com/departments/purchasing', 'TX-Nueces', 'san-antonio'),
  ('port-corpus-christi',  'https://portofcc.com/about/procurement/', 'TX-Nueces', 'san-antonio'),
  ('laredo-city',          'https://www.cityoflaredo.com/purchasing', 'TX-Webb', 'san-antonio')
)
insert into pathfinder.data_sources (
  name, description, candidate_url, adapter_kind,
  jurisdiction, status, config, metadata
)
select
  nr.name,
  'Zedcor Sprint Z10 source — ' || nr.hub_slug,
  nr.candidate_url,
  'custom',
  nr.jurisdiction,
  'live',
  '{}'::jsonb,
  jsonb_build_object(
    'sprint', 'Z10',
    'hub_slug', nr.hub_slug,
    'source_id', nr.name,
    'organization_slug', 'zedcor'
  )
from new_rows nr
where not exists (
  select 1 from pathfinder.data_sources ds
  where ds.name = nr.name
    and ds.metadata->>'sprint' = 'Z10'
);

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- Post-migration sanity probes
-- ─────────────────────────────────────────────────────────────────────────
--   select hub_slug, display_name, status from pathfinder.hubs
--     where organization_id = (select id from pathfinder.organizations where slug='zedcor')
--     order by hub_slug;
--   select name, jurisdiction, metadata->>'hub_slug' as hub
--     from pathfinder.data_sources where metadata->>'sprint' = 'Z10' order by hub, name;
