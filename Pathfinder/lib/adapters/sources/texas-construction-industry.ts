// lib/adapters/sources/texas-construction-industry.ts
//
// Sprint Z13 — Texas Construction Industry digest.
//
// Source: https://www.txconstructionindustry.com/ — state-wide industry
// digest covering project announcements, awards, breaking-ground, and
// regulatory updates. RSS feed at /feed/ when WordPress backend exposes
// it; HTML scrape otherwise.
//
// Filters: title or summary must reference an award or construction
// milestone (awarded / wins / breaks ground / starts construction). All
// rows tagged source_authority='news_report'. Initial project_stage
// is inferred from keywords:
//   "awarded" / "wins" / "low bidder"   → awarded     (buy_window_open=true)
//   "breaks ground" / "begins"          → mobilization (buy_window_open=true)
//   "completes" / "tops out"            → subs_selected (buy_window_open=false)
//
// Mirror of galveston-county.ts gold standard. Returns [] when fetch fails.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const LANDING = 'https://www.txconstructionindustry.com/';
const FEED = 'https://www.txconstructionindustry.com/feed/';

const RELEVANT_KEYWORDS = /\b(awarded|wins?\b|breaks?\s+ground|tops?\s+out|completes?|begins?\s+construction|low\s+bidder|prime\s+contractor|mobilization)\b/i;

function inferStage(text: string): { stage: string; bwo: boolean; conf: number } {
  if (/breaks?\s+ground|begins?\s+construction|mobilization/i.test(text)) return { stage: 'mobilization', bwo: true, conf: 0.85 };
  if (/completes?|tops?\s+out|finishes/i.test(text)) return { stage: 'subs_selected', bwo: false, conf: 0.7 };
  return { stage: 'awarded', bwo: true, conf: 0.8 };
}

export const texasConstructionIndustryAdapter: SourceAdapter = {
  id: 'texas-construction-industry',
  type: 'registered',
  description:
    'Texas Construction Industry digest. State-wide award + milestone announcements; source_authority=news_report.',

  async poll(opts): Promise<SourceEvent[]> {
    let $: cheerio.CheerioAPI;
    // Try the RSS feed first (cleaner), fall back to the landing HTML.
    try {
      $ = await pfFetchHtml(FEED, { fetchImpl: opts.fetch });
    } catch {
      try {
        $ = await pfFetchHtml(LANDING, { fetchImpl: opts.fetch });
      } catch {
        return [];
      }
    }

    const events: SourceEvent[] = [];

    // RSS items: <item><title/><link/><description/><pubDate/></item>
    $('item').each((_idx, item) => {
      const $item = $(item);
      const title = $item.find('title').first().text().trim().replace(/\s+/g, ' ');
      if (!title || title.length < 8) return;
      const link = $item.find('link').first().text().trim();
      const summary = $item.find('description').first().text().trim().slice(0, 600) || null;
      if (!RELEVANT_KEYWORDS.test(`${title} ${summary ?? ''}`)) return;
      if (!link) return;

      const dateRaw = $item.find('pubDate').first().text().trim() || null;
      const { stage, bwo, conf } = inferStage(`${title} ${summary ?? ''}`);

      events.push(
        buildEvent({
          source_event_id: hashId(link),
          title,
          summary,
          posted_date: parseLooseDate(dateRaw ?? null),
          raw_payload: {
            agency: null,
            state: 'TX',
            source_url: link,
            source_authority: 'news_report',
            project_stage: stage,
            phase_confidence: conf,
            buy_window_open: bwo,
          },
        }),
      );
    });

    if (events.length > 0) return events;

    // HTML fallback: walk article-like blocks on the landing page.
    $('article, .post, .entry, h2 a, h3 a').each((_idx, el) => {
      const $el = $(el);
      const title = ($el.is('a') ? $el.text() : $el.find('h2 a, h3 a, .entry-title a').first().text()).trim().replace(/\s+/g, ' ');
      if (!title || title.length < 8) return;
      if (!RELEVANT_KEYWORDS.test(title)) return;
      const href = ($el.is('a') ? $el.attr('href') : $el.find('h2 a, h3 a, .entry-title a').first().attr('href'));
      if (!href) return;
      let sourceUrl: string;
      try { sourceUrl = new URL(href, LANDING).toString(); } catch { return; }
      const { stage, bwo, conf } = inferStage(title);
      events.push(buildEvent({
        source_event_id: hashId(sourceUrl),
        title,
        summary: null,
        posted_date: null,
        raw_payload: {
          state: 'TX',
          source_url: sourceUrl,
          source_authority: 'news_report',
          project_stage: stage,
          phase_confidence: conf,
          buy_window_open: bwo,
        },
      }));
    });

    return events;
  },
};
