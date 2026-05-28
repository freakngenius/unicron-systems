// lib/adapters/sources/fort-bend-county.ts
//
// Sprint Z1A adapter — Fort Bend County Purchasing.
// HTML page at fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const ENDPOINT = 'https://www.fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes';

export const fortBendCountyAdapter: SourceAdapter = {
  id: 'fort-bend-county',
  type: 'registered',
  description: 'Fort Bend County current bids / RFPs / RFQs (HTML scrape).',

  async poll(opts): Promise<SourceEvent[]> {
    const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
    const events: SourceEvent[] = [];

    $('table tr, .accordion-item, li, .panel').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text.length < 12) return;
      if (!/\b(rfp|rfq|bid|ifb|solicitation)\b/i.test(text)) return;
      const title = text.slice(0, 240);
      const link = $(el).find('a').first().attr('href') ?? null;
      const refMatch = text.match(/\b((?:RFP|RFQ|IFB|BID)[-\s]?\d{2,6}-?\d{0,4})\b/i);
      const sourceEventId = refMatch?.[1] ?? hashId(title);
      const absoluteUrl = link ? new URL(link, ENDPOINT).toString() : ENDPOINT;
      const deadlineMatch = text.match(/\b(?:due|close[sd]?|opens?)[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i);
      events.push(
        buildEvent({
          source_event_id: sourceEventId,
          title,
          summary: null,
          posted_date: null,
          raw_payload: {
            agency: 'Fort Bend County Purchasing',
            city: 'Richmond',
            county: 'Fort Bend County',
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
