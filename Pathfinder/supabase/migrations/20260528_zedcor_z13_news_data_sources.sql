-- Sprint Z13 — seed 5 new pathfinder.data_sources rows for the Z13 news
-- + aggregator adapters. Strictly additive (ON CONFLICT DO NOTHING on
-- the metadata->>'source_slug' identity).
--
-- The five rows are:
--   news-engineering-record       (ENR Texas awards — HIGHEST VALUE)
--   texas-construction-industry   (state digest, RSS-first)
--   demandstar-texas              (8k+ TX procurement notices aggregator)
--   houston-business-journal      (HBJ construction news)
--   builders-exchange-texas       (BX Texas project leads)
--
-- All five rows are scoped to the Zedcor organization id
-- ('6cd87740-7c72-4337-ac79-316a54242eef') and registered with
-- adapter_kind='html_scrape' (or 'rss' where the adapter prefers the
-- feed) so the Source Onboarder lineage map shows them as Tier-1 live.

INSERT INTO pathfinder.data_sources
  (name, description, candidate_url, adapter_kind, jurisdiction,
   poll_frequency_seconds, status, config, metadata,
   organization_id, enabled)
VALUES
  (
    'Engineering News-Record — Texas Awards',
    'ENR construction-award announcements filtered to Texas region; names awarded GC + project + owner.',
    'https://www.enr.com/topics/263-awards?topic=263&region=TX',
    'html_scrape',
    'TX',
    86400,
    'live',
    jsonb_build_object('bucket', 1, 'hub', 'houston'),
    jsonb_build_object('source_slug', 'news-engineering-record', 'sprint', 'Z13'),
    '6cd87740-7c72-4337-ac79-316a54242eef',
    true
  ),
  (
    'Texas Construction Industry Digest',
    'State-wide construction industry digest covering awards, groundbreaking, and topping-out announcements.',
    'https://www.txconstructionindustry.com/',
    'rss',
    'TX',
    86400,
    'live',
    jsonb_build_object('bucket', 1, 'hub', 'houston', 'rss_feed', 'https://www.txconstructionindustry.com/feed/'),
    jsonb_build_object('source_slug', 'texas-construction-industry', 'sprint', 'Z13'),
    '6cd87740-7c72-4337-ac79-316a54242eef',
    true
  ),
  (
    'DemandStar — Texas Notices',
    'DemandStar Texas aggregator (~8k TX government procurement opportunities). Free public search; v2 API JSON path.',
    'https://www.demandstar.com/search?state=TX',
    'rest',
    'TX',
    86400,
    'live',
    jsonb_build_object('bucket', 1, 'hub', 'houston', 'api_endpoint', 'https://api.demandstar.com/v2/buyer/notices?state=TX&pageSize=100'),
    jsonb_build_object('source_slug', 'demandstar-texas', 'sprint', 'Z13'),
    '6cd87740-7c72-4337-ac79-316a54242eef',
    true
  ),
  (
    'Houston Business Journal — Construction',
    'HBJ construction news (Houston metro). Title + deck only; detail pages are paywalled but the listing carries award + groundbreaking headlines.',
    'https://www.bizjournals.com/houston/news/construction',
    'html_scrape',
    'TX-Houston',
    86400,
    'live',
    jsonb_build_object('bucket', 1, 'hub', 'houston'),
    jsonb_build_object('source_slug', 'houston-business-journal', 'sprint', 'Z13'),
    '6cd87740-7c72-4337-ac79-316a54242eef',
    true
  ),
  (
    'Builders Exchange of Texas — Projects',
    'BX Texas public project leads (solicitations + pre-bid + awarded announcements). Plansheets are member-only; public listing surfaces title, agency, location.',
    'https://www.bxtexas.org/projects',
    'html_scrape',
    'TX',
    86400,
    'live',
    jsonb_build_object('bucket', 1, 'hub', 'houston'),
    jsonb_build_object('source_slug', 'builders-exchange-texas', 'sprint', 'Z13'),
    '6cd87740-7c72-4337-ac79-316a54242eef',
    true
  )
ON CONFLICT DO NOTHING;
