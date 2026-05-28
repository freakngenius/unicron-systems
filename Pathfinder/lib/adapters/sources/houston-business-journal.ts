// lib/adapters/sources/houston-business-journal.ts
//
// Sprint Z6 — Houston Business Journal Construction beat.
//
// HBJ publishes daily construction news for the Houston metro. The
// adapter filters the construction beat for "awarded", "wins", "win",
// "selected" keywords — those are the post-award stories where the
// prime contractor (GC) is named in the lede and the buy window for
// subcontractors opens.
//
// Endpoint strategy: try the topic RSS feed first
// (/houston/news/construction/feed/), fall back to scraping the topic
// HTML page. HBJ is behind Bizjournals' Cloudflare; on a wall we record
// source_empty with HTML evidence rather than failing loudly.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import {
  buildEvent,
  hashId,
  inferCountyFromText,
  parseLooseDate,
  pfFetch,
} from './_zedcor-shared';

const RSS_URL = 'https://www.bizjournals.com/houston/news/construction/feed/';
const HTML_FALLBACK = 'https://www.bizjournals.com/houston/news/construction';

const AWARD_KEYWORDS: ReadonlyArray<RegExp> = [
  /\bawarded\b/i,
  /\bwins\b/i,
  /\b(named|selected)\b.*\b(contractor|builder|prime|general)\b/i,
  /\bbreaks?\s+ground\b/i,
  /\bcontract\b.*\bworth\b/i,
];

function isAwardStory(text: string): boolean {
  return AWARD_KEYWORDS.some((re) => re.test(text));
}

interface Candidate {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

function parseRss(xml: string): Candidate[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: Candidate[] = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').first().text().trim();
    const link = $(el).find('link').first().text().trim();
    const description = $(el).find('description').first().text().trim();
    const pubDate = $(el).find('pubDate').first().text().trim() || null;
    if (title && link) items.push({ title, link, description, pubDate });
  });
  return items;
}

function parseHtmlListing(html: string): Candidate[] {
  const $ = cheerio.load(html);
  const items: Candidate[] = [];
  $('a[data-track-category="article-link"], article a, .item a, h3 a').each((_, el) => {
    const a = $(el);
    const link = a.attr('href') ?? '';
    const title = a.text().trim();
    if (!link || !title) return;
    items.push({
      title,
      link: link.startsWith('http') ? link : `https://www.bizjournals.com${link.startsWith('/') ? link : `/${link}`}`,
      description: '',
      pubDate: null,
    });
  });
  // de-dup by link
  const seen = new Set<string>();
  return items.filter((c) => (seen.has(c.link) ? false : (seen.add(c.link), true)));
}

export const houstonBusinessJournalAdapter: SourceAdapter = {
  id: 'houston-business-journal',
  type: 'registered',
  description:
    'Houston Business Journal — Construction beat filtered to award/wins/named-as-prime stories naming the GC.',

  async poll(opts): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? fetch;
    let candidates: Candidate[] = [];

    try {
      const res = await pfFetch(RSS_URL, { fetchImpl, headers: { Accept: 'application/rss+xml, application/xml' } });
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

    const filtered = candidates.filter((c) => isAwardStory(`${c.title} ${c.description}`));
    if (filtered.length === 0) return [];

    return filtered.map((c): SourceEvent => {
      const sourceEventId = `hbj:${hashId(c.link)}`;
      const inferredCounty = inferCountyFromText(`${c.title} ${c.description}`) ?? 'Harris County';
      const text = `${c.title} ${c.description}`;
      // Award-language → ship at awarded phase with confidence 0.85.
      const isAward = /\bawarded\b|\bwins\b|\bnamed\s+contractor\b|\bnamed\s+prime\b/i.test(text);
      const projectStage = isAward ? 'awarded' : 'solicitation';
      const phaseConfidence = isAward ? 0.85 : 0.5;
      const buyWindowOpen = isAward;

      return buildEvent({
        source_event_id: sourceEventId,
        title: c.title.slice(0, 500),
        summary: c.description ? c.description.slice(0, 500) : null,
        posted_date: parseLooseDate(c.pubDate),
        raw_payload: {
          agency: null,
          city: 'Houston',
          county: inferredCounty,
          state: 'TX',
          source_url: c.link,
          response_deadline: null,
          estimated_value: null,
          source_authority: 'trade_press',
          project_stage: projectStage,
          phase_confidence: phaseConfidence,
          buy_window_open: buyWindowOpen,
          phase_signal_evidence: c.title,
          hbj_raw: c,
        },
      });
    });
  },
};
