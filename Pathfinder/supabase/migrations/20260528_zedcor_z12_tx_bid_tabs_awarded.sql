-- Sprint Z12 — backfill prime_contractor_name + raw_payload.awarded_to on
-- the three existing tx-bid-tabs mobilization rows in pathfinder.projects.
--
-- The tx-bid-tabs source (data.texas.gov/de7b-7dna, TxDOT bid tabulation
-- Socrata dataset) was seeded via the Perplexity Computer flow without
-- the apparent-low-bidder fields. Z12 confirms the awarded contractors
-- against the SODA API for each project_id and applies them inline so
-- the Notion writer's "prime_contractor_name" column populates without a
-- second ingest pass.
--
-- Apparent-low-bidder lookup (bid_rank_sequence_number='1',
-- low_bidder_flag=true) queried 2026-05-28:
--   A00220668 → MERCER TREE SERVICE                    ($212,515)
--   A00221579 → MARTIN MARIETTA MATERIALS, INC.        ($485,865)
--   A00221580 → WRIGHT ASPHALT PRODUCTS COMPANY LLC    ($470,350)
--
-- Idempotent: only applies when the prime_contractor_name column is null.

UPDATE pathfinder.projects
SET
  prime_contractor_name = 'MERCER TREE SERVICE',
  raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object(
    'awarded_to', 'MERCER TREE SERVICE',
    'awarded_amount', 212515,
    'awarded_source', 'data.texas.gov/de7b-7dna bid_rank=1'
  )
WHERE source = 'tx-bid-tabs'
  AND source_id = 'A00220668'
  AND (prime_contractor_name IS NULL OR prime_contractor_name = '');

UPDATE pathfinder.projects
SET
  prime_contractor_name = 'MARTIN MARIETTA MATERIALS, INC.',
  raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object(
    'awarded_to', 'MARTIN MARIETTA MATERIALS, INC.',
    'awarded_amount', 485865,
    'awarded_source', 'data.texas.gov/de7b-7dna bid_rank=1'
  )
WHERE source = 'tx-bid-tabs'
  AND source_id = 'A00221579'
  AND (prime_contractor_name IS NULL OR prime_contractor_name = '');

UPDATE pathfinder.projects
SET
  prime_contractor_name = 'WRIGHT ASPHALT PRODUCTS COMPANY LLC',
  raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object(
    'awarded_to', 'WRIGHT ASPHALT PRODUCTS COMPANY LLC',
    'awarded_amount', 470350,
    'awarded_source', 'data.texas.gov/de7b-7dna bid_rank=1'
  )
WHERE source = 'tx-bid-tabs'
  AND source_id = 'A00221580'
  AND (prime_contractor_name IS NULL OR prime_contractor_name = '');
