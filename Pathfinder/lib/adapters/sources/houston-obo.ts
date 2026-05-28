// lib/adapters/sources/houston-obo.ts
//
// Sprint Z1A adapter — City of Houston, Office of Business Opportunity.
// Public HTML table at houstontx.gov/obo/current_contracting_opportunities.html.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const ENDPOINT = 'https://www.houstontx.gov/obo/current_contracting_opportunities.html';

export const houstonOboAdapter: SourceAdapter = {
  id: 'houston-obo',
  type: 'registered',
  description: 'City of Houston OBO opportunities (HTML table scrape).',

  async poll(opts): Promise<SourceEvent[]> {
    const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
    const events: SourceEvent[] = [];

    // The OBO page historically uses simple table rows under main content.
    // We try the most common selectors; if none yield rows, return empty.
    const rows = $('table tr').toArray();
    for (const tr of rows) {
      const cells = $(tr).find('td').toArray();
      if (cells.length < 2) continue;
      const title = $(cells[0]).text().trim();
      if (!title || /title|description|solicitation/i.test(title) && cells.length === 1) continue;
      const link = $(cells[0]).find('a').first().attr('href') ?? null;
      const deadlineText = cells[cells.length - 1] ? $(cells[cells.length - 1]).text().trim() : null;
      const postedText = cells.length >= 3 ? $(cells[1]).text().trim() : null;
      const refMatch = title.match(/\b([A-Z]\d?-?\d{2,5}[\/-]?\d{0,4})\b/);
      const sourceEventId = refMatch?.[1] ?? hashId(title);
      const absoluteUrl = link ? new URL(link, ENDPOINT).toString() : ENDPOINT;
      events.push(
        buildEvent({
          source_event_id: sourceEventId,
          title,
          summary: null,
          posted_date: parseLooseDate(postedText),
          raw_payload: {
            agency: 'City of Houston — Office of Business Opportunity',
            city: 'Houston',
            county: 'Harris County',
            state: 'TX',
            source_url: absoluteUrl,
            response_deadline: parseLooseDate(deadlineText),
            estimated_value: null,
            obo_raw_row: cells.map((c) => $(c).text().trim()),
          },
        }),
      );
    }
    return events;
  },
};
