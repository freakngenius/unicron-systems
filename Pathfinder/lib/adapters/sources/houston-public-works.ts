// lib/adapters/sources/houston-public-works.ts
//
// Sprint Z1A adapter — Houston Public Works / Office of Business Opportunity.
// Public HTML landing page at houstonpublicworks.org/office-business-opportunity.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const ENDPOINT = 'https://www.houstonpublicworks.org/office-business-opportunity';

export const houstonPublicWorksAdapter: SourceAdapter = {
  id: 'houston-public-works',
  type: 'registered',
  description: 'Houston Public Works business opportunities (HTML scrape).',

  async poll(opts): Promise<SourceEvent[]> {
    const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
    const events: SourceEvent[] = [];

    // The page historically lists projects under links to PDF announcements.
    // We pick anchors whose text looks like a project / RFQ / RFP.
    $('a').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 8) return;
      if (!/\b(rfp|rfq|bid|project|construction|maintenance)\b/i.test(text)) return;
      const href = $(el).attr('href');
      if (!href) return;
      const absoluteUrl = new URL(href, ENDPOINT).toString();
      const sourceEventId = hashId(`${text}|${absoluteUrl}`);
      events.push(
        buildEvent({
          source_event_id: sourceEventId,
          title: text,
          summary: null,
          posted_date: null,
          raw_payload: {
            agency: 'Houston Public Works',
            city: 'Houston',
            county: 'Harris County',
            state: 'TX',
            source_url: absoluteUrl,
            response_deadline: null,
            estimated_value: null,
            link_kind: href.endsWith('.pdf') ? 'pdf' : 'page',
          },
        }),
      );
    });
    return events;
  },
};
