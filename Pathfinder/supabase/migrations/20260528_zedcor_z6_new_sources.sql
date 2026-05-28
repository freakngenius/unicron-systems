-- 20260528_zedcor_z6_new_sources.sql
--
-- Sprint Z6 — register 5 new sources in pathfinder.data_sources for the
-- Zedcor Houston org. The adapter modules live under
-- Pathfinder/lib/adapters/sources/{slug}.ts and are wired into
-- SOURCE_ADAPTERS via Pathfinder/lib/adapters/sources/index.ts (Z6 wave 3).
--
-- New sources:
--   1. news-engineering-record       — ENR Awards topic feed (Texas-filtered)
--   2. texas-construction-industry   — TX construction trade press digest
--   3. demandstar-texas              — DemandStar Texas procurement aggregator
--   4. houston-business-journal      — HBJ construction beat (award stories)
--   5. builders-exchange-texas       — BX Texas plan room (pre-bid + sub-bid + award)
--
-- Idempotent: ON CONFLICT-style guard via INSERT ... WHERE NOT EXISTS so a
-- replay of the migration on an already-seeded environment is a no-op.
--
-- Spec: Specs/SPEC-zedcor-z6-fetcher-sources.md §"5 new sources".

DO $$
DECLARE
  v_source RECORD;
BEGIN
  FOR v_source IN
    SELECT * FROM (VALUES
      (
        'news-engineering-record'::text,
        'ENR — Awards (Texas)'::text,
        'Engineering News-Record awards topic feed, Texas-filtered. High-confidence post-award announcements that name the prime contractor.'::text,
        'https://www.enr.com/topics/263-awards'::text,
        'rss'::text,
        'TX'::text,
        3600::int
      ),
      (
        'texas-construction-industry'::text,
        'Texas Construction Industry'::text,
        'Trade-press digest covering TX construction projects, awards, and announcements.'::text,
        'https://www.texasconstructionindustry.com/'::text,
        'rss'::text,
        'TX'::text,
        3600::int
      ),
      (
        'demandstar-texas'::text,
        'DemandStar Texas'::text,
        'DemandStar public-facing aggregator of 8,000+ TX state and local procurement opportunities.'::text,
        'https://www.demandstar.com/search?state=TX'::text,
        'rest'::text,
        'TX'::text,
        1800::int
      ),
      (
        'houston-business-journal'::text,
        'Houston Business Journal — Construction'::text,
        'HBJ construction beat filtered to award / wins / named-as-prime stories.'::text,
        'https://www.bizjournals.com/houston/news/construction'::text,
        'rss'::text,
        'TX-Harris'::text,
        3600::int
      ),
      (
        'builders-exchange-texas'::text,
        'Builders Exchange of Texas'::text,
        'BX Texas plan room — pre-bid, sub-bid, and award notices statewide.'::text,
        'https://www.bxtexas.org/projects'::text,
        'custom'::text,
        'TX'::text,
        3600::int
      )
    ) AS t(slug, name, description, candidate_url, adapter_kind, jurisdiction, poll_frequency_seconds)
  LOOP
    INSERT INTO pathfinder.data_sources (
      name,
      description,
      candidate_url,
      adapter_kind,
      jurisdiction,
      poll_frequency_seconds,
      status,
      config,
      metadata,
      created_by_user_email
    )
    SELECT
      v_source.name,
      v_source.description,
      v_source.candidate_url,
      v_source.adapter_kind,
      v_source.jurisdiction,
      v_source.poll_frequency_seconds,
      'live'::text,
      jsonb_build_object(
        'source_slug', v_source.slug,
        'zedcor_sprint', 'z6'
      ),
      jsonb_build_object(
        'org_slug', 'zedcor',
        'introduced_in_sprint', 'z6',
        'introduced_at', '2026-05-28T00:00:00Z'
      ),
      'kyle@freakngenius.com'::text
    WHERE NOT EXISTS (
      SELECT 1 FROM pathfinder.data_sources
      WHERE config->>'source_slug' = v_source.slug
    );
  END LOOP;
END $$;
