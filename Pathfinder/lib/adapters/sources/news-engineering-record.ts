// lib/adapters/sources/news-engineering-record.ts
//
// Sprint Z14 — Engineering News-Record RSS feed adapter.
//
// Z13 shipped an HTML-scrape variant pointed at /topics/263-awards?region=TX.
// That path is Cloudflare-shielded and required ScrapingBee. Z14 swaps to the
// public RSS at https://www.enr.com/rss/articles (verified live 2026-05-28:
// 200 OK with a browser-realistic User-Agent; the single feed covers all
// articles — ENR does not publish per-topic or per-region feeds).
//
// Texas/Gulf filter runs post-fetch by scanning title + description for
// state keywords. Award filter scans for award-verbs. Surviving items get
// the news-gc-extractor treatment to populate raw_payload.gc_name inline at
// ingest time, so downstream Z7 contact resolution + cross-pollination can
// run against rows that never need a Bonfire detail-page fetch.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate } from './_zedcor-shared';
import { extractGcNameFromNewsSnippet } from '../zedcor/news-gc-extractor';

const ENR_RSS_URL = 'https://www.enr.com/rss/articles';

// Browser-realistic UA so Cloudflare doesn't 403 the feed. ENR returns the
// XML directly with a desktop Chrome UA; the default ZEDCOR_UA is rejected.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const AWARD_KEYWORDS =
  /\b(awarded|named|selected|wins?|tapped|chosen|breaks?\s+ground|tops?\s+out|completes?|low\s+bidder|prime\s+contractor|general\s+contractor|contractor\s+of\s+the\s+year|build\s+team)\b/i;

// Gulf-state geofence keywords. Matches state codes, full state names, and
// the major TX metros / counties Zedcor cares about. Loose by design — false
// positives are cheap (the verifier filters again), false negatives are not.
const GEOFENCE_KEYWORDS =
  /\b(TX|Texas|Houston|Dallas|Austin|San\s+Antonio|Fort\s+Worth|El\s+Paso|Galveston|Harris\s+County|Fort\s+Bend|Brazoria|Montgomery\s+County|Corpus\s+Christi|Lubbock|Plano|Arlington|LA|Louisiana|New\s+Orleans|Baton\s+Rouge|Shreveport|OK|Oklahoma|Tulsa|AR|Arkansas|Little\s+Rock)\b/i;

const MAX_ITEMS = 30;
const FETCH_TIMEOUT_MS = 15_000;

function stripHtml(input: string | null | undefined): string {
  if (!input) return '';
  return cheerio.load(`<div>${input}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}

function inferStateFromText(text: string): string {
  const m = text.match(/\b(TX|Texas|Houston|Dallas|Austin|San\s+Antonio|Fort\s+Worth|El\s+Paso|Galveston|Harris\s+County|Fort\s+Bend|Brazoria|Montgomery\s+County|Corpus\s+Christi|Lubbock|Plano|Arlington)\b/i);
  if (m) return 'TX';
  if (/\b(LA|Louisiana|New\s+Orleans|Baton\s+Rouge|Shreveport)\b/i.test(text)) return 'LA';
  if (/\b(OK|Oklahoma|Tulsa)\b/i.test(text)) return 'OK';
  if (/\b(AR|Arkansas|Little\s+Rock)\b/i.test(text)) return 'AR';
  return 'TX'; // default to TX so the geofence filter inside the orchestrator doesn't drop the row
}

export const newsEngineeringRecordAdapter: SourceAdapter = {
  id: 'news-engineering-record',
  type: 'registered',
  description:
    'ENR (Engineering News-Record) RSS feed, Texas/Gulf-state filtered award announcements. Sonnet extractor populates gc_name at ingest time.',

  async poll(opts): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? fetch;
    let xml: string;
    try {
      const res = await fetchImpl(ENR_RSS_URL, {
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
      if (!AWARD_KEYWORDS.test(corpus)) continue;
      if (!GEOFENCE_KEYWORDS.test(corpus)) continue;

      const state = inferStateFromText(corpus);
      const gcResult = await extractGcNameFromNewsSnippet(title, description);

      const sourceEventId = guid || hashId(link || title);
      events.push(
        buildEvent({
          source_event_id: sourceEventId,
          title,
          summary: description.slice(0, 500) || null,
          posted_date: parseLooseDate(pubDate) ?? null,
          raw_payload: {
            agency: null,
            state,
            source_url: link || null,
            source_authority: 'news_report',
            project_stage: 'awarded',
            phase_confidence: 0.9,
            buy_window_open: true,
            gc_name: gcResult.gc_name,
            gc_extraction_layer: gcResult.layer,
            gc_extraction_citation: gcResult.citation,
            news_feed: 'enr_rss_articles',
          },
        }),
      );
    }

    return events;
  },
};
