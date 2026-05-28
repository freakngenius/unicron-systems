// lib/adapters/sources/brazoria-county.ts
//
// Sprint Z1A adapter — Brazoria County Purchasing.
// HTML page at brazoriacountytx.gov/departments/purchasing (root).

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const ENDPOINT = 'https://www.brazoriacountytx.gov/departments/purchasing';

export const brazoriaCountyAdapter: SourceAdapter = {
  id: 'brazoria-county',
  type: 'registered',
  description: 'Brazoria County Purchasing (HTML scrape).',

  async poll(opts): Promise<SourceEvent[]> {
    const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
    const events: SourceEvent[] = [];

    $('a').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 8) return;
      if (!/\b(rfp|rfq|bid|ifb|solicitation|proposal)\b/i.test(text)) return;
      const href = $(el).attr('href');
      if (!href) return;
      const absoluteUrl = new URL(href, ENDPOINT).toString();
      const sourceEventId = hashId(`${text}|${absoluteUrl}`);
      events.push(
        buildEvent({
          source_event_id: sourceEventId,
          title: text.slice(0, 240),
          summary: null,
          posted_date: null,
          raw_payload: {
            agency: 'Brazoria County Purchasing',
            city: 'Angleton',
            county: 'Brazoria County',
            state: 'TX',
            source_url: absoluteUrl,
            response_deadline: null,
            estimated_value: null,
          },
        }),
      );
    });
    return events;
  },
};
