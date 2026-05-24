-- 01_zedcor_pc_seed.sql — Zedcor PC variant seed data.
--
-- Run AFTER 20260524_zedcor_pc_additive.sql migration.
-- Idempotent — uses ON CONFLICT DO NOTHING / DO UPDATE everywhere.
-- Safe to re-run.
--
-- Seeds:
--   1. pathfinder.hubs               — Houston hub for Zedcor (1 row)
--   2. pathfinder.source_licenses    — license classification for 87 sources
--   3. pathfinder.data_sources       — 81 registered sources for Zedcor
--                                       (skipping 6 paid/walled deferred sources)
--
-- Source-list provenance: /home/user/workspace/houston_300mi_procurement_sources.csv,
-- written manually per Kyle's research + Perplexity research, 2026-05-23.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- Resolve Zedcor's organization_id once and reuse via temp table.
-- ─────────────────────────────────────────────────────────────────────────

create temp table _zedcor_org as
  select id as org_id from pathfinder.organizations where slug = 'zedcor' limit 1;

-- Sanity: must have exactly 1 row.
do $$
declare
  cnt integer;
begin
  select count(*) into cnt from _zedcor_org;
  if cnt <> 1 then
    raise exception 'Expected exactly 1 row in _zedcor_org for slug=zedcor, found %', cnt;
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Seed Houston hub
-- ─────────────────────────────────────────────────────────────────────────

insert into pathfinder.hubs
  (organization_id, hub_slug, display_name, status, center_lat, center_lon,
   radius_miles, geofence_states, config, go_live_date)
select
  org_id,
  'houston', 'Houston', 'live',
  29.7604, -95.3698,
  300,
  array['TX','LA','OK','AR'],
  jsonb_build_object(
    'description', 'Greater Houston + 300mi radius. First Zedcor hub for the Pathfinder PC variant.',
    'priority', 1,
    'submission_demo', true
  ),
  current_date
from _zedcor_org
on conflict (organization_id, hub_slug) do update
  set status         = excluded.status,
      display_name   = excluded.display_name,
      center_lat     = excluded.center_lat,
      center_lon     = excluded.center_lon,
      radius_miles   = excluded.radius_miles,
      geofence_states= excluded.geofence_states,
      config         = excluded.config,
      go_live_date   = excluded.go_live_date,
      updated_at     = now();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Seed source_licenses
-- ─────────────────────────────────────────────────────────────────────────
-- Static classification for the 87 known sources. Paid/walled sources
-- (Dodge, ConstructConnect, GovWin, GovTribe, Shovels.ai paid, CoStar)
-- are blocked. Login-required public-content portals are agency_direct_required
-- until the customer-side connector ships (Phase 2). All others commercial_ok.

insert into pathfinder.source_licenses (source_slug, source_url, license_status, classification_basis, notes) values
  -- BUCKET 1 — Open API / public portal (12 sources, all commercial_ok)
  ('sam-gov',                     'https://sam.gov/opportunities',                                                                         'commercial_ok', 'public_records_statute', 'Federal opportunities, open API at open.gsa.gov/api/get-opportunities-public-api.'),
  ('sam-gov-awards',              'https://sam.gov/contract-data',                                                                         'commercial_ok', 'public_records_statute', 'Federal contract awards bulk download.'),
  ('tx-bid-tabs',                 'https://data.texas.gov/dataset/Bid-Tabulations/de7b-7dna',                                               'commercial_ok', 'open_api_tos',           'Socrata SODA API, Texas Open Data.'),
  ('txdot-bid-tabs',              'https://www.txdot.gov/business/road-bridge-maintenance/contract-letting/bid-tabulations-dashboard.html','commercial_ok', 'public_records_statute', 'TxDOT Tableau dashboard; underlying JSON endpoint accessible.'),
  ('txdot-bid-item-index',        'https://www.txdot.gov/business/road-bridge-maintenance/contract-letting/bid-items-and-index.html',       'commercial_ok', 'public_records_statute', 'TxDOT Tableau dashboard, bid item index 22-42 days pre-letting.'),
  ('tx-esbd',                     'http://www.txsmartbuy.com/esbd',                                                                         'commercial_ok', 'public_records_statute', 'TX Electronic State Business Daily, statutory public posting.'),
  ('tx-smartbuy',                 'https://comptroller.texas.gov/purchasing/contracts/search.php',                                          'commercial_ok', 'public_records_statute', 'TX active statewide term contracts.'),
  ('tx-cmbl',                     'https://comptroller.texas.gov/purchasing/',                                                              'commercial_ok', 'public_records_statute', 'TX Centralized Master Bidders List.'),
  ('houston-chronicle-legals',    'https://marketplace.houstonchronicle.com/houston-marketplace/category/legals/bids-proposals',           'legal_review',  'newspaper_paywall_review','Public legal notices statutorily required but Hearst paywall ToS unclear. Operator review.'),
  ('la-pac',                      'https://wwwcfprd.doa.louisiana.gov/osp/lapac/pubmain.cfm',                                               'commercial_ok', 'public_records_statute', 'LA state procurement search, public.'),
  ('la-central-bidding',          'https://www.centralbidding.com',                                                                          'agency_direct_required', 'login_walled', 'Free registration but ToS may restrict aggregation; default to customer-side until reviewed.'),
  ('la-central-auction-house',    'https://www.centralauctionhouse.com',                                                                     'agency_direct_required', 'login_walled', 'Free registration but ToS may restrict aggregation; customer-side connector path.'),

  -- BUCKET 2 — Shared platforms (login-walled bid content)
  ('houston-beacon-bid',          'https://www.houstontx.gov/bizwithhou/',                                                                   'agency_direct_required', 'login_walled', 'Beacon Bid public bids accessible without login at houston.beaconbid.com; ingestor uses that.'),
  ('houston-obo',                 'https://www.houstontx.gov/obo/current_contracting_opportunities.html',                                    'commercial_ok', 'public_records_statute', 'Houston OBO opportunity rollup, fully public.'),
  ('harris-county-bonfire',       'https://purchasing.harriscountytx.gov/Services/Online-Solicitation-Opportunities',                        'agency_direct_required', 'login_walled', 'Bonfire login required for full bid docs; customer-side connector path.'),
  ('harris-health-bonfire',       'https://purchasing.harriscountytx.gov/Harris-Health/Doing-Business-with-Harris-Health',                   'agency_direct_required', 'login_walled', 'Bonfire login required; customer-side connector path.'),
  ('harris-center-mental-health', 'https://www.theharriscenter.org/vendors-and-suppliers',                                                     'commercial_ok', 'public_records_statute', 'Email-driven RFP notifications, public posting.'),
  ('houston-metro',               'https://www.ridemetro.org/about/business-to-business/procurement-opportunities',                          'agency_direct_required', 'login_walled', 'SAP Ariba login required; customer-side connector path.'),
  ('port-houston',                'https://porthouston.com/financial/contracts-and-procurement/',                                            'agency_direct_required', 'login_walled', 'Workday Vendor login required; customer-side connector path.'),
  ('houston-airports',            'https://www.fly2houston.com/airport-business/',                                                            'agency_direct_required', 'login_walled', 'Beacon Bid via COH login.'),
  ('hisd-ionwave',                'https://www.houstonisd.org/community-partnerships/purchasing-services',                                   'agency_direct_required', 'login_walled', 'IonWave login required; customer-side connector path.'),
  ('houston-cc',                  'https://www.houstontx.gov/obo/current_contracting_opportunities.html',                                    'commercial_ok', 'public_records_statute', 'HCC opportunities via OBO rollup; public.'),
  ('uh-system',                   'https://www.uh.edu/finance/Departments/purchasing/',                                                       'commercial_ok', 'public_records_statute', 'UH System purchasing, public + ESBD cross-listed.'),
  ('coh-purchasing-legacy',       'https://purchasinghouston.org',                                                                            'commercial_ok', 'public_records_statute', 'Legacy public portal still active.'),

  -- BUCKET 3 — Houston metro custom portals (mostly public)
  ('fort-bend-county',            'https://www.fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes', 'commercial_ok', 'public_records_statute', 'Public bid postings.'),
  ('montgomery-county-bidnet',    'https://www.bidnetdirect.com/texas/montgomery-county',                                                     'agency_direct_required', 'login_walled', 'BidNet free tier requires registration; ToS review.'),
  ('galveston-county',            'https://www.galvestoncountytx.gov/county-offices/purchasing/solicitations-bids',                          'commercial_ok', 'public_records_statute', 'Public.'),
  ('galveston-city',              'https://www.galvestontx.gov/208/Purchasing',                                                                'agency_direct_required', 'login_walled', 'Daily News paywall + free registration; customer-side path.'),
  ('brazoria-county',             'https://www.brazoriacountytx.gov/departments/purchasing',                                                    'commercial_ok', 'public_records_statute', 'Public.'),
  ('pearland',                    'https://www.pearlandtx.gov/departments/finance/purchasing',                                                  'commercial_ok', 'public_records_statute', 'Public.'),
  ('sugar-land',                  'https://www.sugarlandtx.gov/189/Purchasing',                                                                 'commercial_ok', 'public_records_statute', 'Public.'),
  ('pasadena-tx',                 'https://www.pasadenatx.gov/356/Purchasing',                                                                  'commercial_ok', 'public_records_statute', 'Public.'),
  ('baytown',                     'https://www.baytown.org/city-hall/departments/finance/purchasing',                                          'commercial_ok', 'public_records_statute', 'Public.'),
  ('conroe',                      'https://www.cityofconroe.org/departments/purchasing',                                                       'commercial_ok', 'public_records_statute', 'Public.'),
  ('the-woodlands',               'https://www.thewoodlandstownship-tx.gov/166/Purchasing',                                                     'commercial_ok', 'public_records_statute', 'Public.'),
  ('cfisd-ionwave',               'https://www.cfisd.net/business/purchasing',                                                                   'commercial_ok', 'public_records_statute', 'Posts publicly; IonWave detail behind login.'),
  ('katy-isd-ionwave',            'https://www.katyisd.org/dept/purchasing',                                                                     'commercial_ok', 'public_records_statute', 'Posts publicly; IonWave detail behind login.'),
  ('fbisd-ionwave',               'https://www.fortbendisd.com/purchasing',                                                                      'commercial_ok', 'public_records_statute', 'Posts publicly.'),
  ('spring-isd-ionwave',          'https://www.springisd.org/purchasing',                                                                        'commercial_ok', 'public_records_statute', 'Posts publicly.'),
  ('aldine-isd',                  'https://www.aldineisd.org/business-services/purchasing',                                                     'commercial_ok', 'public_records_statute', 'Public.'),
  ('txdot-houston-district',      'https://www.txdot.gov/about/districts/houston.html',                                                          'commercial_ok', 'public_records_statute', 'ESBD-published + Tableau, public.'),
  ('hctra-bonfire',               'https://www.hctra.org/business-with-hctra',                                                                   'agency_direct_required', 'login_walled', 'Bonfire under Harris.'),
  ('houston-public-works',        'https://www.houstonpublicworks.org/office-business-opportunity',                                              'commercial_ok', 'public_records_statute', 'Public + HBJ ad statutory.'),
  ('houston-housing-authority',   'https://www.housingforhouston.com/about-us/procurement',                                                      'commercial_ok', 'public_records_statute', 'Federal HUD-tied posting.'),
  ('coastal-water-auth',          'https://www.coastalwaterauthority.org/procurement',                                                            'commercial_ok', 'public_records_statute', 'Public water district.'),
  ('san-jacinto-river-auth',      'https://www.sjra.net/business-with-sjra/procurement/',                                                          'commercial_ok', 'public_records_statute', 'Public.'),
  ('harris-galveston-subsidence', 'https://hgsubsidence.org/',                                                                                    'commercial_ok', 'public_records_statute', 'Public regulator.'),
  ('texas-medical-center',        'https://www.tmc.edu/about-tmc/vendors/',                                                                       'commercial_ok', 'open_api_tos',           'Public vendor postings.'),

  -- BUCKET 4 — 300mi radius expansion
  ('san-antonio-city',            'https://webapp1.sanantonio.gov/BidContractOpps/Default.aspx',                                                  'commercial_ok', 'public_records_statute', 'Public.'),
  ('austin-eresponse',            'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm',                  'commercial_ok', 'public_records_statute', 'Public eResponse listing.'),
  ('fort-worth-city',             'https://www.fortworthtexas.gov/departments/purchasing',                                                         'commercial_ok', 'public_records_statute', 'Public.'),
  ('corpus-christi-city',         'https://www.corpuschristitx.gov/department-directory/finance-procurement/contracts-and-procurement/',         'commercial_ok', 'public_records_statute', 'Public.'),
  ('arlington-city',              'https://www.arlingtontx.gov/city_hall/departments/financial_and_management_resources/purchasing',             'commercial_ok', 'public_records_statute', 'Public.'),
  ('plano-city',                  'https://www.plano.gov/187/Purchasing',                                                                          'commercial_ok', 'public_records_statute', 'Public.'),
  ('garland-city',                'https://www.garlandtx.gov/171/Purchasing',                                                                      'commercial_ok', 'public_records_statute', 'Public.'),
  ('irving-city',                 'https://www.cityofirving.org/164/Purchasing',                                                                   'commercial_ok', 'public_records_statute', 'Public.'),
  ('laredo-city',                 'https://www.cityoflaredo.com/Departments/Purchasing',                                                            'commercial_ok', 'public_records_statute', 'Public.'),
  ('new-orleans-city',            'https://nola.gov/view-bid-opportunities/',                                                                       'commercial_ok', 'public_records_statute', 'Public BidOps.'),
  ('baton-rouge-city',            'https://www.brla.gov/358/Purchasing',                                                                            'agency_direct_required', 'login_walled', 'Central Auction House login.'),
  ('dallas-county-bidnet',        'https://www.bidnetdirect.com/texas/dallas-county',                                                              'agency_direct_required', 'login_walled', 'BidNet TPG registration.'),
  ('tarrant-county',              'https://www.tarrantcountytx.gov/en/purchasing.html',                                                             'commercial_ok', 'public_records_statute', 'Public.'),
  ('bexar-county',                'https://www.bexar.org/616/Supplier-PortalVendor-Registration',                                                  'agency_direct_required', 'login_walled', 'Supplier portal registration.'),
  ('travis-county',               'https://www.traviscountytx.gov/purchasing',                                                                      'commercial_ok', 'public_records_statute', 'Public.'),
  ('nueces-county',               'https://www.nuecesco.com/county-services/purchasing',                                                            'commercial_ok', 'public_records_statute', 'Public.'),
  ('dfw-airport',                 'https://www.dfwairport.com/business/opportunities/procurement/',                                                  'commercial_ok', 'public_records_statute', 'Public own-portal.'),
  ('austin-bergstrom',            'https://www.austintexas.gov/department/aviation/business-opportunities',                                          'commercial_ok', 'public_records_statute', 'Public via Austin eResponse.'),
  ('san-antonio-airport',         'https://www.flysanantonio.com/about/business-opportunities/',                                                     'commercial_ok', 'public_records_statute', 'Public.'),
  ('port-corpus-christi',         'https://portofcc.com/business/procurement/',                                                                     'commercial_ok', 'public_records_statute', 'Public vendor roster.'),
  ('port-beaumont',               'https://www.portofbeaumont.com/business/procurement',                                                            'commercial_ok', 'public_records_statute', 'Public.'),
  ('port-nola',                   'https://portnola.com/business/procurement',                                                                       'agency_direct_required', 'login_walled', 'Central Bidding login.'),
  ('port-baton-rouge',            'https://www.portgbr.com/business/procurement',                                                                    'agency_direct_required', 'login_walled', 'Central Bidding login.'),
  ('dallas-isd',                  'https://www.dallasisd.org/Page/171',                                                                              'commercial_ok', 'public_records_statute', 'Public.'),
  ('fort-worth-isd',              'https://www.fwisd.org/departments/purchasing',                                                                    'commercial_ok', 'public_records_statute', 'Public.'),
  ('austin-isd-bonfire',          'https://www.austinisd.org/cp/bids',                                                                                'agency_direct_required', 'login_walled', 'Bonfire login.'),
  ('san-antonio-isd',             'https://www.saisd.net/page/procurement',                                                                            'commercial_ok', 'public_records_statute', 'Public.'),
  ('northside-isd-sa',            'https://nisdpurchasing.nisd.net',                                                                                   'commercial_ok', 'public_records_statute', 'Public.'),
  ('sara-bonfire',                'https://www.sariverauthority.org/about/contracting/',                                                              'agency_direct_required', 'login_walled', 'Bonfire login.'),
  ('ut-system',                   'https://financials.utexas.edu/services/purchasing',                                                                'commercial_ok', 'public_records_statute', 'Public.'),
  ('tamu-system',                 'https://www.tamus.edu/business/budgets-accounting/purchasing/',                                                    'commercial_ok', 'public_records_statute', 'Public.'),
  ('utmb-galveston',              'https://www.utmb.edu/finance/purchasing',                                                                             'commercial_ok', 'public_records_statute', 'Public.'),

  -- PAID / DEFERRED (6 sources, blocked for submission demo)
  ('bidnet-tx-premium',           'https://www.bidnetdirect.com/texas',                                                                                'blocked',       'paid_subscription',      'Paid only. Deferred.'),
  ('dodge-construction',          'https://www.construction.com/dodge-one/',                                                                            'blocked',       'paid_subscription',      'Incumbent competitor. Deferred.'),
  ('constructconnect',            'https://www.constructconnect.com',                                                                                   'blocked',       'paid_subscription',      'Incumbent competitor. Deferred.'),
  ('govwin-iq',                   'https://iq.govwin.com',                                                                                               'blocked',       'paid_subscription',      'Paid only. Deferred.'),
  ('govtribe',                    'https://govtribe.com',                                                                                                 'blocked',       'paid_subscription',      'Paid only. Deferred.'),
  ('shovels-ai',                  'https://www.shovels.ai',                                                                                                 'legal_review',  'paid_subscription',      'Paid API; free tier may be commercial_ok if Zedcor pays. Operator decision.'),
  ('costar-loopnet',              'https://www.costar.com',                                                                                                  'blocked',       'paid_subscription',      'Paid only. Deferred.')
on conflict (source_slug) do update
  set license_status      = excluded.license_status,
      classification_basis= excluded.classification_basis,
      source_url          = excluded.source_url,
      notes               = excluded.notes,
      last_classified_at  = now(),
      updated_at          = now();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Seed data_sources rows
-- ─────────────────────────────────────────────────────────────────────────
-- pathfinder.data_sources is the existing registry of onboarded sources.
-- Each row links to a source_license via source_slug (stored in metadata).
-- PC ingestor reads from this table at run start, filtered to:
--   organization_id = Zedcor AND status = 'live' AND
--   license_status in ('commercial_ok')
--
-- adapter_kind values: socrata | rest | rss | json-dump | tier_2_pending.
-- For PC-driven scrapes we use 'tier_2_pending' (browser-driven, no
-- generated adapter yet — PC is the adapter).

insert into pathfinder.data_sources
  (organization_id, name, description, candidate_url, adapter_kind,
   jurisdiction, poll_frequency_seconds, status, config, metadata, created_by_user_email)
select
  z.org_id,
  src.name, src.description, src.candidate_url, src.adapter_kind,
  src.jurisdiction, src.poll_freq, src.status, src.config, src.metadata,
  'kyle@demystified.ai'
from _zedcor_org z
cross join (values
  -- BUCKET 1 (open API + public)
  ('SAM.gov Opportunities',                              'Federal contract opportunities ≥$25K, all NAICS', 'https://sam.gov/opportunities',                                                                         'rest',              'federal', 86400, 'live'::text,    jsonb_build_object('bucket',1,'hub','houston'),                jsonb_build_object('source_slug','sam-gov')),
  ('SAM.gov Contract Awards',                            'Federal contract awards bulk download',           'https://sam.gov/contract-data',                                                                         'rest',              'federal', 86400, 'live',           jsonb_build_object('bucket',1,'hub','houston'),                jsonb_build_object('source_slug','sam-gov-awards')),
  ('Texas Open Data — Bid Tabulations',                  'Historical TX bid tabulations',                   'https://data.texas.gov/dataset/Bid-Tabulations/de7b-7dna',                                               'socrata',           'TX',      86400, 'live',           jsonb_build_object('bucket',1,'hub','houston','soda_endpoint','de7b-7dna'), jsonb_build_object('source_slug','tx-bid-tabs')),
  ('TxDOT Bid Tabulations Dashboard',                    'TxDOT awarded bid tabulations',                   'https://www.txdot.gov/business/road-bridge-maintenance/contract-letting/bid-tabulations-dashboard.html','tier_2_pending',    'TX',      86400, 'live',           jsonb_build_object('bucket',1,'hub','houston','tableau',true), jsonb_build_object('source_slug','txdot-bid-tabs')),
  ('TxDOT Bid Item Index Dashboard',                     '22-42 day pre-letting bid items',                 'https://www.txdot.gov/business/road-bridge-maintenance/contract-letting/bid-items-and-index.html',      'tier_2_pending',    'TX',      86400, 'live',           jsonb_build_object('bucket',1,'hub','houston','tableau',true), jsonb_build_object('source_slug','txdot-bid-item-index')),
  ('TxDOT Electronic State Business Daily',              'TX state solicitation feed (statutory)',          'http://www.txsmartbuy.com/esbd',                                                                         'rss',               'TX',      86400, 'live',           jsonb_build_object('bucket',1,'hub','houston'),                jsonb_build_object('source_slug','tx-esbd')),
  ('TxSmartBuy Statewide Contracts',                     'Active TX state term contracts',                  'https://comptroller.texas.gov/purchasing/contracts/search.php',                                          'tier_2_pending',    'TX',      86400, 'live',           jsonb_build_object('bucket',1,'hub','houston'),                jsonb_build_object('source_slug','tx-smartbuy')),
  ('TX Centralized Master Bidders List',                 'TX vendor master list',                           'https://comptroller.texas.gov/purchasing/',                                                              'tier_2_pending',    'TX',      86400, 'live',           jsonb_build_object('bucket',1,'hub','houston'),                jsonb_build_object('source_slug','tx-cmbl')),
  ('Houston Chronicle Legal Notices',                    'Statutory bid advertisements',                    'https://marketplace.houstonchronicle.com/houston-marketplace/category/legals/bids-proposals',           'tier_2_pending',    'TX-Houston', 86400, 'paused',       jsonb_build_object('bucket',1,'hub','houston'),                jsonb_build_object('source_slug','houston-chronicle-legals','paused_reason','license_legal_review')),
  ('LaPAC',                                              'LA state procurement search',                     'https://wwwcfprd.doa.louisiana.gov/osp/lapac/pubmain.cfm',                                               'tier_2_pending',    'LA',      86400, 'live',           jsonb_build_object('bucket',1,'hub','houston'),                jsonb_build_object('source_slug','la-pac')),
  ('Houston OBO Opportunities',                          'Houston cross-agency opportunity rollup',         'https://www.houstontx.gov/obo/current_contracting_opportunities.html',                                    'tier_2_pending',    'TX-Houston', 86400, 'live',         jsonb_build_object('bucket',2,'hub','houston'),                jsonb_build_object('source_slug','houston-obo')),
  ('Harris Center for Mental Health',                    'Harris County mental health vendor postings',     'https://www.theharriscenter.org/vendors-and-suppliers',                                                     'tier_2_pending',    'TX-Harris',  86400, 'live',         jsonb_build_object('bucket',2,'hub','houston'),                jsonb_build_object('source_slug','harris-center-mental-health')),

  -- BUCKET 3 — Houston metro custom portals (public)
  ('Fort Bend County Purchasing',                        'Fort Bend County opportunities',                  'https://www.fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes', 'tier_2_pending', 'TX-Fort Bend', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','fort-bend-county')),
  ('Galveston County Purchasing',                        'Galveston County opportunities',                  'https://www.galvestoncountytx.gov/county-offices/purchasing/solicitations-bids',                          'tier_2_pending', 'TX-Galveston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','galveston-county')),
  ('Brazoria County Purchasing',                         'Brazoria County opportunities',                   'https://www.brazoriacountytx.gov/departments/purchasing',                                                    'tier_2_pending', 'TX-Brazoria', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','brazoria-county')),
  ('Pearland Purchasing',                                'City of Pearland opportunities',                  'https://www.pearlandtx.gov/departments/finance/purchasing',                                                  'tier_2_pending', 'TX-Pearland', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','pearland')),
  ('Sugar Land Purchasing',                              'City of Sugar Land opportunities',                'https://www.sugarlandtx.gov/189/Purchasing',                                                                 'tier_2_pending', 'TX-Sugar Land', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','sugar-land')),
  ('Pasadena TX Purchasing',                             'City of Pasadena TX opportunities',               'https://www.pasadenatx.gov/356/Purchasing',                                                                  'tier_2_pending', 'TX-Pasadena', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','pasadena-tx')),
  ('Baytown Purchasing',                                 'City of Baytown opportunities',                   'https://www.baytown.org/city-hall/departments/finance/purchasing',                                           'tier_2_pending', 'TX-Baytown', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','baytown')),
  ('Conroe Purchasing',                                  'City of Conroe opportunities',                    'https://www.cityofconroe.org/departments/purchasing',                                                        'tier_2_pending', 'TX-Conroe', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','conroe')),
  ('The Woodlands Township',                             'Woodlands Township opportunities',                'https://www.thewoodlandstownship-tx.gov/166/Purchasing',                                                     'tier_2_pending', 'TX-Woodlands', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','the-woodlands')),
  ('CFISD Purchasing',                                   'Cypress-Fairbanks ISD postings',                  'https://www.cfisd.net/business/purchasing',                                                                   'tier_2_pending', 'TX-CFISD', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','cfisd-ionwave')),
  ('Katy ISD Purchasing',                                'Katy ISD postings',                                'https://www.katyisd.org/dept/purchasing',                                                                     'tier_2_pending', 'TX-Katy ISD', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','katy-isd-ionwave')),
  ('Fort Bend ISD Purchasing',                           'Fort Bend ISD postings',                          'https://www.fortbendisd.com/purchasing',                                                                      'tier_2_pending', 'TX-FBISD', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','fbisd-ionwave')),
  ('Spring ISD Purchasing',                              'Spring ISD postings',                              'https://www.springisd.org/purchasing',                                                                        'tier_2_pending', 'TX-Spring ISD', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','spring-isd-ionwave')),
  ('Aldine ISD Purchasing',                              'Aldine ISD postings',                              'https://www.aldineisd.org/business-services/purchasing',                                                      'tier_2_pending', 'TX-Aldine ISD', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','aldine-isd')),
  ('Houston Community College',                          'HCC opportunities via OBO',                       'https://www.houstontx.gov/obo/current_contracting_opportunities.html',                                       'tier_2_pending', 'TX-HCC', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','houston-cc')),
  ('University of Houston System',                       'UH System purchasing',                            'https://www.uh.edu/finance/Departments/purchasing/',                                                          'tier_2_pending', 'TX-UH', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','uh-system')),
  ('COH Public Purchasing (legacy)',                     'Legacy COH purchasing portal',                    'https://purchasinghouston.org',                                                                              'tier_2_pending', 'TX-Houston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','coh-purchasing-legacy')),
  ('Houston Public Works',                               'Houston PW opportunities',                        'https://www.houstonpublicworks.org/office-business-opportunity',                                              'tier_2_pending', 'TX-Houston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','houston-public-works')),
  ('Houston Housing Authority',                          'HHA federal HUD-tied postings',                   'https://www.housingforhouston.com/about-us/procurement',                                                       'tier_2_pending', 'TX-Houston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','houston-housing-authority')),
  ('Coastal Water Authority',                            'CWA procurement',                                 'https://www.coastalwaterauthority.org/procurement',                                                            'tier_2_pending', 'TX-Houston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','coastal-water-auth')),
  ('San Jacinto River Authority',                        'SJRA procurement',                                'https://www.sjra.net/business-with-sjra/procurement/',                                                          'tier_2_pending', 'TX-Houston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','san-jacinto-river-auth')),
  ('Harris-Galveston Subsidence District',               'HGSD procurement',                                'https://hgsubsidence.org/',                                                                                     'tier_2_pending', 'TX-Houston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','harris-galveston-subsidence')),
  ('Texas Medical Center',                               'TMC vendor portal',                               'https://www.tmc.edu/about-tmc/vendors/',                                                                        'tier_2_pending', 'TX-Houston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','texas-medical-center')),
  ('TxDOT Houston District',                             'TxDOT Houston district opportunities',            'https://www.txdot.gov/about/districts/houston.html',                                                            'tier_2_pending', 'TX-Houston', 86400, 'live', jsonb_build_object('bucket',3,'hub','houston'), jsonb_build_object('source_slug','txdot-houston-district')),

  -- BUCKET 4 — 300mi radius expansion
  ('City of San Antonio',                                'San Antonio bid opportunities',                   'https://webapp1.sanantonio.gov/BidContractOpps/Default.aspx',                                                   'tier_2_pending', 'TX-San Antonio', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','san-antonio-city')),
  ('City of Austin eResponse',                           'Austin eResponse solicitations',                  'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm',                    'tier_2_pending', 'TX-Austin', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','austin-eresponse')),
  ('City of Fort Worth',                                 'Fort Worth purchasing',                            'https://www.fortworthtexas.gov/departments/purchasing',                                                          'tier_2_pending', 'TX-Fort Worth', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','fort-worth-city')),
  ('City of Corpus Christi',                             'Corpus Christi procurement',                       'https://www.corpuschristitx.gov/department-directory/finance-procurement/contracts-and-procurement/',           'tier_2_pending', 'TX-Corpus Christi', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','corpus-christi-city')),
  ('City of Arlington TX',                               'Arlington purchasing',                             'https://www.arlingtontx.gov/city_hall/departments/financial_and_management_resources/purchasing',                'tier_2_pending', 'TX-Arlington', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','arlington-city')),
  ('City of Plano',                                      'Plano procurement',                                'https://www.plano.gov/187/Purchasing',                                                                            'tier_2_pending', 'TX-Plano', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','plano-city')),
  ('City of Garland',                                    'Garland purchasing',                               'https://www.garlandtx.gov/171/Purchasing',                                                                        'tier_2_pending', 'TX-Garland', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','garland-city')),
  ('City of Irving',                                     'Irving purchasing',                                'https://www.cityofirving.org/164/Purchasing',                                                                     'tier_2_pending', 'TX-Irving', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','irving-city')),
  ('City of Laredo',                                     'Laredo purchasing',                                'https://www.cityoflaredo.com/Departments/Purchasing',                                                              'tier_2_pending', 'TX-Laredo', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','laredo-city')),
  ('City of New Orleans BidOps',                         'NOLA bid opportunities',                            'https://nola.gov/view-bid-opportunities/',                                                                         'tier_2_pending', 'LA-New Orleans', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','new-orleans-city')),
  ('Tarrant County Purchasing',                          'Tarrant County opportunities',                     'https://www.tarrantcountytx.gov/en/purchasing.html',                                                               'tier_2_pending', 'TX-Tarrant', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','tarrant-county')),
  ('Travis County Purchasing',                           'Travis County opportunities',                      'https://www.traviscountytx.gov/purchasing',                                                                       'tier_2_pending', 'TX-Travis', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','travis-county')),
  ('Nueces County Purchasing',                           'Nueces County opportunities',                      'https://www.nuecesco.com/county-services/purchasing',                                                              'tier_2_pending', 'TX-Nueces', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','nueces-county')),
  ('DFW International Airport',                          'DFW Airport procurement',                          'https://www.dfwairport.com/business/opportunities/procurement/',                                                    'tier_2_pending', 'TX-DFW', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','dfw-airport')),
  ('Austin-Bergstrom Airport',                           'AUS airport opportunities',                        'https://www.austintexas.gov/department/aviation/business-opportunities',                                            'tier_2_pending', 'TX-Austin', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','austin-bergstrom')),
  ('San Antonio International Airport',                  'SAT airport opportunities',                        'https://www.flysanantonio.com/about/business-opportunities/',                                                       'tier_2_pending', 'TX-San Antonio', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','san-antonio-airport')),
  ('Port of Corpus Christi',                             'Port CC procurement',                              'https://portofcc.com/business/procurement/',                                                                       'tier_2_pending', 'TX-Corpus Christi', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','port-corpus-christi')),
  ('Port of Beaumont',                                   'Port Beaumont procurement',                        'https://www.portofbeaumont.com/business/procurement',                                                              'tier_2_pending', 'TX-Beaumont', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','port-beaumont')),
  ('Dallas ISD',                                          'Dallas ISD purchasing',                            'https://www.dallasisd.org/Page/171',                                                                              'tier_2_pending', 'TX-Dallas ISD', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','dallas-isd')),
  ('Fort Worth ISD',                                     'FWISD purchasing',                                 'https://www.fwisd.org/departments/purchasing',                                                                    'tier_2_pending', 'TX-FWISD', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','fort-worth-isd')),
  ('San Antonio ISD',                                    'SAISD purchasing',                                 'https://www.saisd.net/page/procurement',                                                                          'tier_2_pending', 'TX-SAISD', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','san-antonio-isd')),
  ('Northside ISD (San Antonio)',                        'Northside ISD purchasing',                         'https://nisdpurchasing.nisd.net',                                                                                 'tier_2_pending', 'TX-NISD', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','northside-isd-sa')),
  ('UT System / UT Austin',                              'UT purchasing',                                    'https://financials.utexas.edu/services/purchasing',                                                                'tier_2_pending', 'TX-UT', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','ut-system')),
  ('Texas A&M System',                                   'TAMU procurement',                                 'https://www.tamus.edu/business/budgets-accounting/purchasing/',                                                    'tier_2_pending', 'TX-TAMU', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','tamu-system')),
  ('UTMB Galveston',                                     'UTMB Galveston purchasing',                        'https://www.utmb.edu/finance/purchasing',                                                                          'tier_2_pending', 'TX-UTMB', 86400, 'live', jsonb_build_object('bucket',4,'hub','houston'), jsonb_build_object('source_slug','utmb-galveston'))
) as src(name, description, candidate_url, adapter_kind, jurisdiction, poll_freq, status, config, metadata)
on conflict do nothing;

-- Sanity probes (commit, then run):
--   select count(*) from pathfinder.data_sources d
--     join _zedcor_org z on d.organization_id = z.org_id
--     where d.metadata->>'source_slug' is not null;
--   select bucket, count(*) from (
--     select metadata->'config'->>'bucket' as bucket
--     from pathfinder.data_sources d
--     join _zedcor_org z on d.organization_id = z.org_id) s
--   group by 1 order by 1;

commit;
