// lib/adapters/sources/houston-business-journal.ts
//
// Sprint Z13 — Houston Business Journal construction news.
//
// HBJ publishes Houston-metro award + groundbreaking + topping-out
// stories at https://www.bizjournals.com/houston/news/construction.
// HBJ is paywalled below the headline; the listing page surfaces enough
// (title, deck, byline) that the GC name extraction layer can run on
// the headline + deck alone. Detail-page enrichment falls back through
// the Z13 tiered fetcher chain (ScrapingBee / Playwright).
//
// Filters: only stories whose headline matches award/win/breaks-ground
// keywords. project_stage inferred from keywords. State='TX' always.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const LANDING = 'https://www.bizjournals.com/houston/news/construction';

const AWARD_KEYWORDS = /\b(awarded|wins?\b|breaks?\s+ground|tops?\s+out|completes?|begins?\s+construction|low\s+bidder|prime\s+contractor|selected\s+(?:as|for))\b/i;

function inferStage(title: string): { stage: string; bwo: boolean; conf: number } {
  if (/breaks?\s+ground|begins?\s+construction/i.test(title)) return { stage: 'mobilization', bwo: true, conf: 0.85 };
  if (/completes?|tops?\s+out/i.test(title)) return { stage: 'subs_selected', bwo: false, conf: 0.7 };
  return { stage: 'awarded', bwo: true, conf: 0.8 };
}

export const houstonBusinessJournalAdapter: SourceAdapter = {
  id: 'houston-business-journal',
  type: 'registered',
  description:
    'Houston Business Journal construction news. Title+deck only (paywall on detail); source_authority=news_report.',

  async poll(opts): Promise<SourceEvent[]> {
    let $: cheerio.CheerioAPI;
    try {
      $ = await pfFetchHtml(LANDING, { fetchImpl: opts.fetch });
    } catch {
      return [];
    }

    const events: SourceEvent[] = [];

    // bizjournals templates use multiple article-card classes; we accept
    // any anchor whose href contains '/houston/news/' and whose nearest
    // headline element has text. Belt+suspenders against template churn.
    $('a').each((_idx, a) => {
      const $a = $(a);
      const href = $a.attr('href') || '';
      if (!/\/houston\/news\//i.test(href)) return;
      const title = $a.text().trim().replace(/\s+/g, ' ');
      if (!title || title.length < 8) return;
      if (!AWARD_KEYWORDS.test(title)) return;

      let sourceUrl: string;
      try { sourceUrl = new URL(href, LANDING).toString(); } catch { return; }

      // Deck is usually the sibling/descendant <p>.
      const summary = $a.closest('article, .item, .news-item').find('p, .deck, .summary').first().text().trim().replace(/\s+/g, ' ') || null;
      const dateRaw = $a.closest('article, .item').find('time').first().attr('datetime') ?? null;
      const { stage, bwo, conf } = inferStage(title);

      events.push(buildEvent({
        source_event_id: hashId(sourceUrl),
        title,
        summary,
        posted_date: parseLooseDate(dateRaw ?? null),
        raw_payload: {
          state: 'TX',
          city: 'Houston',
          source_url: sourceUrl,
          source_authority: 'news_report',
          project_stage: stage,
          phase_confidence: conf,
          buy_window_open: bwo,
        },
      }));
    });

    // Dedup by source_event_id — the listing has anchor duplicates
    // (image link + headline link to same article).
    const seen = new Set<string>();
    return events.filter((e) => {
      if (seen.has(e.source_event_id)) return false;
      seen.add(e.source_event_id);
      return true;
    });
  },
};
