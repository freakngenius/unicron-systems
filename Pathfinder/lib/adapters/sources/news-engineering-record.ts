// lib/adapters/sources/news-engineering-record.ts
//
// Sprint Z13 — Engineering News-Record awards feed.
//
// ENR publishes construction-award announcements at
//   https://www.enr.com/topics/263-awards
// and a Texas-filtered subview at
//   https://www.enr.com/topics/263-awards?topic=263&region=TX
//
// Each announcement names the awarded GC + the project + the owner.
// HIGHEST VALUE source in Z13 — directly populates gc_name on Texas
// construction rows at project_stage='awarded' with phase_confidence=0.9.
//
// Strategy:
//   1) Fetch the Texas-region listing HTML.
//   2) Walk the article cards, emit one event per Texas award.
//   3) Each event tagged source_authority='news_report',
//      project_stage='awarded', buy_window_open=true (post-aging logic
//      in phase-signals.ts re-evaluates the window).
//   4) When the listing returns empty / Cloudflare-blocked, return [].
//      The Z6 verify diagnostic + orchestrator's empty/failed accounting
//      surfaces the outcome.
//
// Mirror of galveston-county.ts gold standard: thin adapter, all
// heuristic logic kept inside. No detail-page fetches inside the
// adapter itself — gc-extractor's Wave 2.5 enrichment handles that.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const ENR_AWARDS_TEXAS =
  'https://www.enr.com/topics/263-awards?topic=263&region=TX';

const AWARDED_KEYWORDS = /\b(awarded|wins?\b|breaks?\s+ground|tops?\s+out|completes?|low\s+bidder|prime\s+contractor)\b/i;

export const newsEngineeringRecordAdapter: SourceAdapter = {
  id: 'news-engineering-record',
  type: 'registered',
  description:
    'Engineering News-Record (ENR) Texas awards feed. Names awarded GC + project + owner; project_stage=awarded.',

  async poll(opts): Promise<SourceEvent[]> {
    let $: cheerio.CheerioAPI;
    try {
      $ = await pfFetchHtml(ENR_AWARDS_TEXAS, { fetchImpl: opts.fetch });
    } catch {
      return [];
    }

    const events: SourceEvent[] = [];

    // ENR's article cards live under `.article-list-item` / `.article-card`
    // depending on which template version is active. Try both shapes.
    $('.article-list-item, .article-card, article').each((_idx, el) => {
      const $el = $(el);
      const titleEl = $el.find('h2 a, h3 a, .article-title a, a.title').first();
      const title = titleEl.text().trim().replace(/\s+/g, ' ');
      if (!title || title.length < 8) return;
      if (!AWARDED_KEYWORDS.test(title)) return;

      const href = titleEl.attr('href');
      if (!href) return;
      let sourceUrl: string;
      try {
        sourceUrl = new URL(href, ENR_AWARDS_TEXAS).toString();
      } catch {
        return;
      }

      const summary =
        $el.find('.article-summary, .deck, .article-excerpt, p').first().text().trim().replace(/\s+/g, ' ') || null;
      const dateRaw =
        $el.find('time').attr('datetime') ?? $el.find('.date, .pub-date').first().text().trim() ?? null;

      const sourceEventId = hashId(sourceUrl);
      events.push(
        buildEvent({
          source_event_id: sourceEventId,
          title,
          summary,
          posted_date: parseLooseDate(dateRaw ?? null),
          raw_payload: {
            agency: null,
            state: 'TX',
            source_url: sourceUrl,
            source_authority: 'news_report',
            project_stage: 'awarded',
            phase_confidence: 0.9,
            buy_window_open: true,
            enr_topic: '263-awards',
          },
        }),
      );
    });

    return events;
  },
};
