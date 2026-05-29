-- 20260529_zedcor_z14_1_adapter_url_fixes.sql
--
-- Sprint Z14.1 — fix two broken adapter upstreams seeded by Z13.
--
--   1) texas-construction-industry: pointed at https://www.txconstructionindustry.com/.
--      That host has no DNS A record (verified 2026-05-29). No working
--      replacement found among standard candidates (texasconstructionnews.com
--      is a parked-domain redirector; constructionnewsmagazine.com does not
--      resolve; constructionconnect.com returns 405). Action: flip the
--      data_sources row to status='paused', enabled=false so the orchestrator
--      stops polling it. Adapter code left intact for future re-enable when
--      a working URL is found.
--
--   2) builders-exchange-texas: pointed at https://www.bxtexas.org/projects.
--      That host has no DNS A record (verified 2026-05-29). Replacement
--      identified: https://www.virtualbx.com — "Virtual Builders Exchange,
--      Commercial Construction Leads for Texas". Real WordPress RSS at /feed
--      (verified: 10 items, 60KB, real Texas construction lead content).
--      Action: UPDATE candidate_url, adapter_kind=rss, and metadata.rss_feed
--      so the orchestrator hits the working URL. Adapter id stays
--      'builders-exchange-texas' so downstream lineage doesn't churn.
--
-- Both UPDATEs are idempotent (filtered by metadata->>'source_slug').

UPDATE pathfinder.data_sources
SET
  status = 'paused',
  enabled = false,
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object('paused_reason', 'upstream_dns_dead', 'paused_at', '2026-05-29', 'paused_in_sprint', 'Z14.1')
WHERE metadata->>'source_slug' = 'texas-construction-industry'
  AND organization_id = '6cd87740-7c72-4337-ac79-316a54242eef';

UPDATE pathfinder.data_sources
SET
  name = 'Virtual Builders Exchange — Texas Commercial Leads',
  description = 'Virtual Builders Exchange RSS feed. ~10 fresh Texas commercial construction leads per refresh (groundbreaking, awards, solicitations). Replaces dead bxtexas.org upstream from Z13.',
  candidate_url = 'https://www.virtualbx.com',
  adapter_kind = 'rss',
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'rss_feed', 'https://www.virtualbx.com/feed',
      'repointed_from', 'https://www.bxtexas.org/projects',
      'repointed_at', '2026-05-29',
      'repointed_in_sprint', 'Z14.1'
    )
WHERE metadata->>'source_slug' = 'builders-exchange-texas'
  AND organization_id = '6cd87740-7c72-4337-ac79-316a54242eef';
