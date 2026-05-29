// lib/adapters/sources/houston-business-journal.ts
//
// Sprint Z14 — Houston Business Journal RSS adapter.
//
// Z13 shipped an HTML-scrape variant pointed at /houston/news/construction.
// That path is Cloudflare-shielded and the headlines are duplicated across
// anchor tags. Z14 swaps to the public RSS feed (per spec). The exact feed
// path is configurable via env (HBJ_FEED_URL) because bizjournals.com has
// rotated their feed routes historically; default candidate is the
// industry-vertical construction feed.
//
// If the feed returns non-200 or empty, the adapter returns [] and the
// orchestrator records `source_empty` cleanly. Z14 spec accepts this:
// "If a news source's RSS feed URL is wrong or the feed structure changed,
// log the verbatim XML excerpt and continue with HTML fallback."
//
// Item filter: title or description must match award/groundbreaking
// keywords. Each surviving item runs through the news-gc-extractor to
// populate raw_payload.gc_name at ingest time.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate } from './_zedcor-shared';
import { extractGcNameFromNewsSnippet } from '../zedcor/news-gc-extractor';

const HBJ_FEED_URL =
  process.env.HBJ_FEED_URL ?? 'https://www.bizjournals.com/houston/news/construction/feed';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const AWARD_KEYWORDS =
  /\b(awarded|wins?\b|breaks?\s+ground|tops?\s+out|completes?|begins?\s+construction|low\s+bidder|prime\s+contractor|general\s+contractor|selected\s+(?:as|for)|names?\b|chosen|tapped|build\s+team)\b/i;

const CONSTRUCTION_KEYWORDS =
  /\b(construction|contractor|builder|build\s+team|breaks?\s+ground|tops?\s+out|completes?|project|tower|building|campus|complex|facility|warehouse|distribution|logistics|industrial|mixed[-\s]use|residential|hotel|hospital|medical|school|stadium|arena|airport|terminal|highway|bridge|tunnel|water|wastewater|treatment|renovation|expansion|retrofit)\b/i;

const MAX_ITEMS = 30;
const FETCH_TIMEOUT_MS = 15_000;

function stripHtml(input: string | null | undefined): string {
  if (!input) return '';
  return cheerio.load(`<div>${input}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}

function inferStage(text: string): { stage: string; bwo: boolean; conf: number } {
  if (/breaks?\s+ground|begins?\s+construction/i.test(text)) {
    return { stage: 'mobilization', bwo: true, conf: 0.85 };
  }
  if (/completes?|tops?\s+out/i.test(text)) {
    return { stage: 'subs_selected', bwo: false, conf: 0.7 };
  }
  return { stage: 'awarded', bwo: true, conf: 0.8 };
}

export const houstonBusinessJournalAdapter: SourceAdapter = {
  id: 'houston-business-journal',
  type: 'registered',
  description:
    'Houston Business Journal construction RSS. Sonnet extractor populates gc_name at ingest time. State=TX, City=Houston.',

  async poll(opts): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? fetch;
    let xml: string;
    try {
      const res = await fetchImpl(HBJ_FEED_URL, {
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
            city: 'Houston',
            source_url: link || null,
            source_authority: 'news_report',
            project_stage: stage,
            phase_confidence: conf,
            buy_window_open: bwo,
            gc_name: gcResult.gc_name,
            gc_extraction_layer: gcResult.layer,
            gc_extraction_citation: gcResult.citation,
            news_feed: 'hbj_construction_rss',
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
