// lib/adapters/sources/txdot-houston-district.ts
//
// Sprint Z1A adapter — TxDOT Houston District.
// Landing page at txdot.gov/about/districts/houston.html.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const ENDPOINT = 'https://www.txdot.gov/about/districts/houston.html';

export const txdotHoustonDistrictAdapter: SourceAdapter = {
  id: 'txdot-houston-district',
  type: 'registered',
  description: 'TxDOT Houston District (HTML scrape; landing + contracting follow).',

  async poll(opts): Promise<SourceEvent[]> {
    const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
    const events: SourceEvent[] = [];

    $('a').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 8) return;
      if (!/\b(letting|project|construction|maintenance|notice|lay-?down|surveillance)\b/i.test(text)) return;
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
            agency: 'TxDOT — Houston District',
            city: 'Houston',
            county: 'Harris County',
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
