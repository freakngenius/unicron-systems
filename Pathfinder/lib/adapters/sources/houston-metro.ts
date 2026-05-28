// lib/adapters/sources/houston-metro.ts
//
// Sprint Z1A adapter — Houston METRO procurement opportunities.
// HTML page at ridemetro.org/about/business-to-business/procurement-opportunities.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const ENDPOINT = 'https://www.ridemetro.org/about/business-to-business/procurement-opportunities';

export const houstonMetroAdapter: SourceAdapter = {
  id: 'houston-metro',
  type: 'registered',
  description: 'METRO Houston procurement opportunities (HTML scrape).',

  async poll(opts): Promise<SourceEvent[]> {
    const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
    const events: SourceEvent[] = [];

    // METRO lists opportunities in cards/rows with project IDs in the title.
    $('table tr, .views-row, .opportunity, .card').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text.length < 12) return;
      if (!/\b(rfp|rfq|ifb|solicitation)\b/i.test(text)) return;
      const title = text.slice(0, 240);
      const link = $(el).find('a').first().attr('href') ?? null;
      const refMatch = text.match(/\b((?:RFP|RFQ|IFB)[-\s]?\d{2,6}-?\d{0,4})\b/i);
      const sourceEventId = refMatch?.[1] ?? hashId(title);
      const absoluteUrl = link ? new URL(link, ENDPOINT).toString() : ENDPOINT;
      const deadlineMatch = text.match(/\b(?:due|close[sd]?)[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i);
      events.push(
        buildEvent({
          source_event_id: sourceEventId,
          title,
          summary: null,
          posted_date: null,
          raw_payload: {
            agency: 'METRO Houston',
            city: 'Houston',
            county: 'Harris County',
            state: 'TX',
            source_url: absoluteUrl,
            response_deadline: deadlineMatch ? parseLooseDate(deadlineMatch[1]) : null,
            estimated_value: null,
          },
        }),
      );
    });
    return events;
  },
};
