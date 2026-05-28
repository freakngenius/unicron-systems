// lib/adapters/sources/builders-exchange-texas.ts
//
// Sprint Z13 — Builders Exchange of Texas project leads.
//
// BX Texas posts project leads (solicitations + pre-bid + awarded
// announcements) at https://www.bxtexas.org/projects. The page is
// public-facing but lists detailed plansheets behind member-only links.
// We surface what's public: title, agency, location, plan-issuance date.
//
// Mirror of galveston-county.ts gold standard. Returns [] on fetch
// failure or when the page renders no project cards (BX Texas rotates
// inactive projects off the public listing without a clear "no
// results" marker, so an empty parse is normal).

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const LANDING = 'https://www.bxtexas.org/projects';

export const buildersExchangeTexasAdapter: SourceAdapter = {
  id: 'builders-exchange-texas',
  type: 'registered',
  description:
    'Builders Exchange of Texas project leads. Public project listing; plansheets are member-only. source_authority=public_construction.',

  async poll(opts): Promise<SourceEvent[]> {
    let $: cheerio.CheerioAPI;
    try {
      $ = await pfFetchHtml(LANDING, { fetchImpl: opts.fetch });
    } catch {
      return [];
    }

    const events: SourceEvent[] = [];

    // BX Texas templates use either a table of projects or a card grid
    // depending on logged-in state. Try the table shape first.
    $('table.projects tbody tr, .project-card, .project-listing-row').each((_idx, el) => {
      const $el = $(el);
      const cells = $el.find('td');
      let title = '';
      let agency: string | null = null;
      let city: string | null = null;
      let postedRaw: string | null = null;
      let href: string | undefined;

      if (cells.length >= 3) {
        // Table form: [title, agency, location, posted, ...]
        title = $(cells[0]).text().trim().replace(/\s+/g, ' ');
        agency = $(cells[1]).text().trim() || null;
        city = $(cells[2]).text().trim() || null;
        postedRaw = cells.length > 3 ? $(cells[3]).text().trim() : null;
        href = $(cells[0]).find('a').first().attr('href') ?? undefined;
      } else {
        // Card form.
        title = $el.find('.project-title, h3 a, h2 a').first().text().trim().replace(/\s+/g, ' ');
        agency = $el.find('.project-agency, .agency').first().text().trim() || null;
        city = $el.find('.project-location, .location').first().text().trim() || null;
        postedRaw = $el.find('.project-date, time').first().attr('datetime') ?? $el.find('.project-date').first().text().trim() ?? null;
        href = $el.find('a').first().attr('href') ?? undefined;
      }

      if (!title || title.length < 4) return;
      if (!href) return;
      let sourceUrl: string;
      try { sourceUrl = new URL(href, LANDING).toString(); } catch { return; }

      events.push(buildEvent({
        source_event_id: hashId(sourceUrl),
        title,
        summary: null,
        posted_date: parseLooseDate(postedRaw ?? null),
        raw_payload: {
          agency,
          city,
          state: 'TX',
          source_url: sourceUrl,
          source_authority: 'public_construction',
          project_stage: 'solicitation',
          phase_confidence: 0.75,
          buy_window_open: true,
        },
      }));
    });

    return events;
  },
};
