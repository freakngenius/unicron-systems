// lib/adapters/sources/texas-construction-industry.ts
//
// Sprint Z6 — Texas Construction Industry digest. Trade press covering
// Texas construction projects, awards, and announcements. Mid-confidence
// source: stories may name the prime contractor (extractable downstream
// via Z3.5 enrichment) but the listing itself is solicitation-grade.
//
// Endpoint strategy: try the WordPress-style RSS feed first
// (/feed/), fall back to the HTML category landing page if absent. Many
// trade-press sites ship /feed/ by default.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import {
  buildEvent,
  hashId,
  initialPhaseTagging,
  parseLooseDate,
  pfFetch,
} from './_zedcor-shared';

const RSS_PRIMARY = 'https://www.texasconstructionindustry.com/feed/';
const HTML_FALLBACK = 'https://www.texasconstructionindustry.com/';

interface Candidate {
  title: string;
  link: string;
  summary: string;
  pubDate: string | null;
}

function parseRss(xml: string): Candidate[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: Candidate[] = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').first().text().trim();
    const link = $(el).find('link').first().text().trim();
    const summary = $(el).find('description').first().text().trim();
    const pubDate = $(el).find('pubDate').first().text().trim() || null;
    if (title && link) items.push({ title, link, summary, pubDate });
  });
  return items;
}

function parseHtmlListing(html: string): Candidate[] {
  const $ = cheerio.load(html);
  const items: Candidate[] = [];
  $('article, .post, .entry, .news-item').each((_, el) => {
    const a = $(el).find('a').first();
    const link = a.attr('href') ?? '';
    const title = a.text().trim() || $(el).find('h2,h3').first().text().trim();
    const summary = $(el).find('p, .excerpt, .summary').first().text().trim();
    const pubDate = $(el).find('time').attr('datetime') ?? null;
    if (title && link) {
      items.push({
        title,
        link: link.startsWith('http') ? link : `https://www.texasconstructionindustry.com${link.startsWith('/') ? link : `/${link}`}`,
        summary,
        pubDate,
      });
    }
  });
  return items;
}

export const texasConstructionIndustryAdapter: SourceAdapter = {
  id: 'texas-construction-industry',
  type: 'registered',
  description:
    'Texas Construction Industry digest — trade-press stories about Texas construction projects, awards, and announcements.',

  async poll(opts): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? fetch;
    let candidates: Candidate[] = [];

    try {
      const res = await pfFetch(RSS_PRIMARY, { fetchImpl, headers: { Accept: 'application/rss+xml, application/xml' } });
      const body = await res.text();
      candidates = parseRss(body);
    } catch {
      candidates = [];
    }

    if (candidates.length === 0) {
      try {
        const res = await pfFetch(HTML_FALLBACK, { fetchImpl });
        const body = await res.text();
        candidates = parseHtmlListing(body);
      } catch {
        return [];
      }
    }

    if (candidates.length === 0) return [];

    const init = initialPhaseTagging();
    return candidates.map((c): SourceEvent => {
      const sourceEventId = `txci:${hashId(c.link)}`;
      return buildEvent({
        source_event_id: sourceEventId,
        title: c.title.slice(0, 500),
        summary: c.summary ? c.summary.slice(0, 500) : null,
        posted_date: parseLooseDate(c.pubDate),
        raw_payload: {
          agency: null,
          city: null,
          county: null,
          state: 'TX',
          source_url: c.link,
          response_deadline: null,
          estimated_value: null,
          source_authority: 'trade_press',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          txci_raw: c,
        },
      });
    });
  },
};
