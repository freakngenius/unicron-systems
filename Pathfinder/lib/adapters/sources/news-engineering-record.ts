// lib/adapters/sources/news-engineering-record.ts
//
// Sprint Z6 — Engineering News-Record (ENR) "Awards" topic feed, Texas-filtered.
//
// Why this matters: ENR publishes the highest-quality post-award announcements
// in the industry. Each story names the prime contractor, the agency owner,
// the project value, and the location. For Zedcor (mobile solar surveillance
// towers, GC-to-sub model), an ENR award story is the moment the buy window
// opens — the prime contractor is now selecting subcontractors and securing
// the site.
//
// Phase tagging (per Sprint Z6 spec):
//   - project_stage = 'awarded'
//   - phase_confidence = 0.9
//   - buy_window_open = true (post-aging logic still applies downstream)
//
// Endpoint discovery (2026-05-28): ENR ships an RSS feed for the awards
// taxonomy at /rss/topic/263-awards. We try that first (cheap, structured),
// and fall back to scraping the HTML topic landing page if the feed shape
// drifts. Texas filter is applied in code by matching the title + summary
// against TX-state and Texas-city names.
//
// ENR is fronted by Cloudflare; on a 403/Cloudflare wall the adapter records
// source_empty with HTML evidence and the orchestrator logs the layer.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import {
  buildEvent,
  hashId,
  parseLooseDate,
  pfFetch,
} from './_zedcor-shared';

const RSS_URL = 'https://www.enr.com/rss/topic/263-awards';
const HTML_FALLBACK = 'https://www.enr.com/topics/263-awards';

const TX_MARKERS: ReadonlyArray<RegExp> = [
  /\b(texas|tx)\b/i,
  /\bhouston\b/i,
  /\bdallas\b/i,
  /\baustin\b/i,
  /\bsan antonio\b/i,
  /\bfort worth\b/i,
  /\barlington\b/i,
  /\bel paso\b/i,
  /\bcorpus christi\b/i,
  /\bgalveston\b/i,
  /\bbeaumont\b/i,
  /\bplano\b/i,
  /\blubbock\b/i,
];

function looksTexas(text: string): boolean {
  return TX_MARKERS.some((re) => re.test(text));
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
  $('article, .article-summary, .archive-item, .list-item').each((_, el) => {
    const a = $(el).find('a').first();
    const link = a.attr('href') ?? '';
    const title = a.text().trim() || $(el).find('h2,h3,h4').first().text().trim();
    const description = $(el).find('p, .summary, .deck').first().text().trim();
    const pubDate = $(el).find('time').attr('datetime') ?? null;
    if (title && link) {
      const absolute = link.startsWith('http')
        ? link
        : `https://www.enr.com${link.startsWith('/') ? link : `/${link}`}`;
      items.push({ title, link: absolute, description, pubDate });
    }
  });
  return items;
}

export const newsEngineeringRecordAdapter: SourceAdapter = {
  id: 'news-engineering-record',
  type: 'registered',
  description:
    'ENR (Engineering News-Record) Awards topic feed — Texas-filtered. High-value GC award announcements naming prime contractors.',

  async poll(opts): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? fetch;

    // Try RSS first
    let candidates: Candidate[] = [];
    try {
      const res = await pfFetch(RSS_URL, { fetchImpl, headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
      const body = await res.text();
      candidates = parseRss(body);
    } catch {
      candidates = [];
    }

    // Fallback to HTML listing
    if (candidates.length === 0) {
      try {
        const res = await pfFetch(HTML_FALLBACK, { fetchImpl });
        const body = await res.text();
        candidates = parseHtmlListing(body);
      } catch {
        // both feeds inaccessible — return source_empty by returning [].
        return [];
      }
    }

    const txOnly = candidates.filter((c) => looksTexas(`${c.title} ${c.description}`));
    if (txOnly.length === 0) return [];

    return txOnly.map((c): SourceEvent => {
      const sourceEventId = `enr:${hashId(c.link)}`;
      return buildEvent({
        source_event_id: sourceEventId,
        title: c.title.slice(0, 500),
        summary: c.description ? c.description.slice(0, 500) : null,
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
          // Z6 spec — ENR award stories ship at phase=awarded by default.
          project_stage: 'awarded',
          phase_confidence: 0.9,
          buy_window_open: true,
          phase_signal_evidence: c.title,
          enr_raw: c,
        },
      });
    });
  },
};
