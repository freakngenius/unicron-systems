// lib/adapters/sources/builders-exchange-texas.ts
//
// Sprint Z14.1 — Virtual Builders Exchange RSS adapter.
//
// Z13 pointed this adapter at https://www.bxtexas.org/projects. That host
// has no DNS record (verified 2026-05-29 from this network and via dig).
// Z14.1 swaps to https://www.virtualbx.com — "Virtual Builders Exchange,
// Commercial Construction Leads for Texas" — which publishes a WordPress
// RSS feed at /feed/ with ~10 items per refresh, each typically a Texas
// commercial construction project lead (groundbreaking, awards,
// solicitations). Verified live 2026-05-29: 10 items, 60KB feed, real
// content like "Brownsville: Border Crossing Modernization Project Breaks
// Ground" — exactly the lead shape Zedcor needs.
//
// Adapter id stays `builders-exchange-texas` so the existing
// pathfinder.data_sources row + downstream lineage map continue to work
// without a separate registration. The Z14.1 migration UPDATEs the row's
// candidate_url + metadata.rss_feed to point at virtualbx.com.
//
// Strategy mirrors Z14 ENR / HBJ pattern:
//   1. Fetch RSS with a browser-realistic UA.
//   2. Filter items by award/groundbreaking/construction keywords.
//   3. Run news-gc-extractor on title+description to populate
//      raw_payload.gc_name at ingest.
//   4. Per-item stage inference (breaks-ground → mobilization,
//      completes/tops-out → subs_selected, default → solicitation).

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate } from './_zedcor-shared';
import { extractGcNameFromNewsSnippet } from '../zedcor/news-gc-extractor';

// Trailing slash on /feed/ matters — /feed (no slash) returns a 301 to
// /feed/. Node fetch follows redirects by default but skipping the
// redirect hop is faster + avoids any env where the fetch impl doesn't.
const VBX_FEED_URL = process.env.VBX_FEED_URL ?? 'https://www.virtualbx.com/feed/';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CONSTRUCTION_KEYWORDS =
  /\b(construction|contractor|builder|breaks?\s+ground|tops?\s+out|completes?|project|tower|building|campus|complex|facility|warehouse|distribution|logistics|industrial|mixed[-\s]use|residential|hotel|hospital|medical|school|stadium|arena|airport|terminal|highway|bridge|tunnel|water|wastewater|treatment|renovation|expansion|retrofit|crossing|infrastructure|modernization)\b/i;

const MAX_ITEMS = 30;
const FETCH_TIMEOUT_MS = 15_000;

function stripHtml(input: string | null | undefined): string {
  if (!input) return '';
  return cheerio.load(`<div>${input}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}

function inferStage(text: string): { stage: string; bwo: boolean; conf: number } {
  if (/breaks?\s+ground|begins?\s+construction|mobiliz/i.test(text)) {
    return { stage: 'mobilization', bwo: true, conf: 0.85 };
  }
  if (/completes?|tops?\s+out/i.test(text)) {
    return { stage: 'subs_selected', bwo: false, conf: 0.7 };
  }
  if (/awarded|wins?\b|selected|named/i.test(text)) {
    return { stage: 'awarded', bwo: true, conf: 0.8 };
  }
  return { stage: 'solicitation', bwo: true, conf: 0.65 };
}

export const buildersExchangeTexasAdapter: SourceAdapter = {
  id: 'builders-exchange-texas',
  type: 'registered',
  description:
    'Virtual Builders Exchange — Commercial Construction Leads for Texas. RSS feed at /feed. news-gc-extractor populates gc_name at ingest. State=TX.',

  async poll(opts): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? fetch;
    let xml: string;
    try {
      const res = await fetchImpl(VBX_FEED_URL, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return [];
      xml = await res.text();
    } catch {
      return [];
    }

    const $ = cheerio.load(xml, { xmlMode: true });
    const events: SourceEvent[] = [];
    const items = $('item').toArray().slice(0, MAX_ITEMS);

    for (const item of items) {
      const $item = $(item);
      const title = $item.find('title').first().text().trim();
      if (!title || title.length < 8) continue;

      const descRaw = $item.find('description').first().text();
      const description = stripHtml(descRaw);
      const link = $item.find('link').first().text().trim();
      const guid = $item.find('guid').first().text().trim();
      const pubDate = $item.find('pubDate').first().text().trim();

      const corpus = `${title}\n${description}`;
      if (!CONSTRUCTION_KEYWORDS.test(corpus)) continue;

      const { stage, bwo, conf } = inferStage(corpus);
      const gcResult = await extractGcNameFromNewsSnippet(title, description);

      events.push(
        buildEvent({
          source_event_id: guid || hashId(link || title),
          title,
          summary: description.slice(0, 500) || null,
          posted_date: parseLooseDate(pubDate) ?? null,
          raw_payload: {
            state: 'TX',
            source_url: link || null,
            source_authority: 'public_construction',
            project_stage: stage,
            phase_confidence: conf,
            buy_window_open: bwo,
            gc_name: gcResult.gc_name,
            gc_extraction_layer: gcResult.layer,
            gc_extraction_citation: gcResult.citation,
            news_feed: 'virtualbx_rss',
          },
        }),
      );
    }

    // Dedup by source_event_id (RSS shouldn't repeat, but belt+suspenders).
    const seen = new Set<string>();
    return events.filter((e) => {
      if (seen.has(e.source_event_id)) return false;
      seen.add(e.source_event_id);
      return true;
    });
  },
};
