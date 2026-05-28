// lib/adapters/sources/builders-exchange-texas.ts
//
// Sprint Z6 — Builders Exchange of Texas (BX Texas) project leads.
//
// BX Texas is a construction trade association whose Plan Room publishes
// pre-bid, sub-bid, and post-award notices for projects across Texas.
// Pre-bid notices map to phase=solicitation; sub-bid notices map to
// phase=gc_selected (GC has won the contract and is seeking subs); award
// notices map to phase=awarded with buy_window_open=true.
//
// Endpoint discovery: BX Texas runs a Drupal-like CMS at
// https://www.bxtexas.org/projects with category filters. Without a
// stable JSON API documented publicly, the adapter scrapes the HTML
// listing and parses each row's title + status badge to infer phase.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import {
  buildEvent,
  hashId,
  inferCountyFromText,
  parseLooseDate,
  pfFetch,
} from './_zedcor-shared';

const LISTING_URL = 'https://www.bxtexas.org/projects';

interface Candidate {
  title: string;
  link: string;
  status: string | null;
  postedDate: string | null;
  agency: string | null;
}

function inferPhase(status: string | null, title: string): {
  project_stage: 'solicitation' | 'gc_selected' | 'awarded';
  phase_confidence: number;
  buy_window_open: boolean;
} {
  const s = (status ?? '').toLowerCase();
  const t = title.toLowerCase();
  if (/\baward(ed)?\b/.test(s) || /\baward(ed)?\b/.test(t)) {
    return { project_stage: 'awarded', phase_confidence: 0.85, buy_window_open: true };
  }
  if (/\bsub[- ]?bid\b/.test(s) || /\bsub[- ]?bid\b/.test(t)) {
    return { project_stage: 'gc_selected', phase_confidence: 0.8, buy_window_open: true };
  }
  return { project_stage: 'solicitation', phase_confidence: 0.5, buy_window_open: false };
}

function parseHtmlListing(html: string): Candidate[] {
  const $ = cheerio.load(html);
  const items: Candidate[] = [];
  // BX Texas project rows: try a few selectors that commonly hit Drupal
  // node views and content listings.
  $('.project-listing-item, .views-row, article.project, tr.project-row').each((_, el) => {
    const a = $(el).find('a').first();
    const link = a.attr('href') ?? '';
    const title = a.text().trim() || $(el).find('h2,h3,.project-title').first().text().trim();
    if (!link || !title) return;
    const status =
      $(el).find('.status, .project-status, .badge').first().text().trim() || null;
    const postedDate = $(el).find('time, .date, .posted-date').attr('datetime')
      ?? $(el).find('time, .date, .posted-date').first().text().trim()
      ?? null;
    const agency = $(el).find('.agency, .owner, .project-owner').first().text().trim() || null;
    items.push({
      title,
      link: link.startsWith('http') ? link : `https://www.bxtexas.org${link.startsWith('/') ? link : `/${link}`}`,
      status,
      postedDate,
      agency,
    });
  });
  // Fallback: generic anchor inside main content
  if (items.length === 0) {
    $('main a, #content a').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const title = $(el).text().trim();
      if (!href.includes('/project') || !title || title.length < 8) return;
      items.push({
        title,
        link: href.startsWith('http') ? href : `https://www.bxtexas.org${href.startsWith('/') ? href : `/${href}`}`,
        status: null,
        postedDate: null,
        agency: null,
      });
    });
  }
  const seen = new Set<string>();
  return items.filter((c) => (seen.has(c.link) ? false : (seen.add(c.link), true)));
}

export const buildersExchangeTexasAdapter: SourceAdapter = {
  id: 'builders-exchange-texas',
  type: 'registered',
  description:
    'Builders Exchange of Texas — trade-association plan room. Pre-bid, sub-bid, and award notices.',

  async poll(opts): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? fetch;

    let html: string;
    try {
      const res = await pfFetch(LISTING_URL, { fetchImpl });
      html = await res.text();
    } catch {
      return [];
    }

    const candidates = parseHtmlListing(html);
    if (candidates.length === 0) return [];

    return candidates.map((c): SourceEvent => {
      const sourceEventId = `bxtex:${hashId(c.link)}`;
      const inferredCounty = inferCountyFromText(`${c.title} ${c.agency ?? ''}`);
      const phase = inferPhase(c.status, c.title);
      return buildEvent({
        source_event_id: sourceEventId,
        title: c.title.slice(0, 500),
        summary: c.status ? `Status: ${c.status}` : null,
        posted_date: parseLooseDate(c.postedDate),
        raw_payload: {
          agency: c.agency,
          city: null,
          county: inferredCounty,
          state: 'TX',
          source_url: c.link,
          response_deadline: null,
          estimated_value: null,
          source_authority: 'trade_association',
          project_stage: phase.project_stage,
          phase_confidence: phase.phase_confidence,
          buy_window_open: phase.buy_window_open,
          phase_signal_evidence: c.status ?? c.title,
          bx_raw: c,
        },
      });
    });
  },
};
