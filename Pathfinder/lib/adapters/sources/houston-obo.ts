// lib/adapters/sources/houston-obo.ts
//
// Sprint Z3 adapter — City of Houston, Office of Business Opportunity.
// Endpoint: https://www.houstontx.gov/obo/current_contracting_opportunities.html
//
// SELECTOR NOTE (verified 2026-05-28):
//   The OBO "Current Contracting Opportunities" page is a directory page —
//   it does NOT list individual bid rows. The main content (inside
//   `div.mainContent`) is structured as repeating pairs of:
//     <p><strong>{Agency Name}</strong></p>
//     <ul class="bullets">
//       <li><a href="{portal-url}" ...>{Portal Title}</a></li>
//       ...
//     </ul>
//   Each <li> inside `ul.bullets` points to an external partner-agency
//   procurement portal (e.g. "COH Strategic Purchasing Bid Search", "PHA
//   Bid and Proposal Notices", "HISD Proposal Solicitations Download").
//   The previous adapter scanned `table tr` and produced zero rows because
//   no <table> exists on this page.
//
//   Strategy: each portal-link is emitted as one SourceEvent representing
//   the current-solicitation gateway for that partner agency. The detail-
//   page enricher then fetches the most-recently-listed portals (top-5)
//   to extract phase signals (e.g. "pre-bid conference", "addendum",
//   "award notice") from the live portal HTML. Posted_date is null
//   (directory has no per-row timestamps); response_deadline is null.
//   source_event_id is hashId(portal-title) for stable cross-cycle dedupe.
//
// Geofence: every link on this page is a Houston / Harris County /
// Texas-region agency, so state='TX' for all rows.

import type { SourceAdapter, SourceEvent } from './types';
import {
  applyEnrichmentToPayload,
  buildEvent,
  enrichDetailPages,
  hashId,
  initialPhaseTagging,
  isInZedcorGeofence,
  pfFetchHtml,
} from './_zedcor-shared';

const ENDPOINT = 'https://www.houstontx.gov/obo/current_contracting_opportunities.html';
const ROW_SELECTOR = 'div.mainContent ul.bullets > li';

const AGENCY_DEFAULT = 'City of Houston Office of Business Opportunity';

// Portal-URL substring → (city, county, agency-override).
// Used to scope each emitted event to the partner agency the link points at.
const AGENCY_HINTS: Array<{ kw: RegExp; agency: string; county: string }> = [
  { kw: /fly2houston\.com/i, agency: 'Houston Airport System', county: 'Harris County' },
  { kw: /publicworks\.houstontx\.gov/i, agency: 'City of Houston Public Works', county: 'Harris County' },
  { kw: /generalservices/i, agency: 'City of Houston General Services Department', county: 'Harris County' },
  { kw: /bizwithhou/i, agency: 'City of Houston Strategic Purchasing', county: 'Harris County' },
  { kw: /ridemetro\.org/i, agency: 'METRO Houston', county: 'Harris County' },
  { kw: /porthouston\.com/i, agency: 'Port of Houston Authority', county: 'Harris County' },
  { kw: /houstonisd\.org/i, agency: 'Houston Independent School District', county: 'Harris County' },
  { kw: /hccs\.edu/i, agency: 'Houston Community College', county: 'Harris County' },
  { kw: /harriscountytx\.gov/i, agency: 'Harris County Purchasing', county: 'Harris County' },
  { kw: /comptroller\.texas\.gov/i, agency: 'State of Texas Purchasing', county: 'Harris County' },
  { kw: /sam\.gov/i, agency: 'U.S. Federal Government (SAM.gov)', county: 'Harris County' },
  { kw: /housingforhouston\.com/i, agency: 'Houston Housing Authority', county: 'Harris County' },
];

function resolveAgency(href: string): { agency: string; county: string } {
  for (const hint of AGENCY_HINTS) {
    if (hint.kw.test(href)) return { agency: hint.agency, county: hint.county };
  }
  return { agency: AGENCY_DEFAULT, county: 'Harris County' };
}

// Filter the OBO page noise: classified-ad aggregators and other non-bid links
// occasionally appear in the same `ul.bullets`. We exclude them so we don't
// over-emit non-procurement rows.
const EXCLUDE_HREF = /chron\.com|bizjournals\.com|mailto:|^#/i;

export const houstonOboAdapter: SourceAdapter = {
  id: 'houston-obo',
  type: 'registered',
  description:
    'City of Houston Office of Business Opportunity — directory of partner-agency current-solicitation portals (HTML scrape).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
      const init = initialPhaseTagging();

      // First pass: extract candidate rows (one per ul.bullets > li > a).
      type Row = {
        sourceEventId: string;
        title: string;
        sourceUrl: string;
        agency: string;
        county: string;
        postedDate: string | null;
      };
      const rows: Row[] = [];

      $(ROW_SELECTOR).each((_, li) => {
        const $a = $(li).find('a').first();
        const rawHref = $a.attr('href');
        if (!rawHref) return;
        if (EXCLUDE_HREF.test(rawHref)) return;
        const text = $a.text().trim().replace(/\s+/g, ' ');
        if (!text || text.length < 4) return;
        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(rawHref, ENDPOINT).toString();
        } catch {
          return;
        }
        // Skip self-references back into the OBO directory tree.
        if (/houstontx\.gov\/obo\//i.test(absoluteUrl)) return;
        const { agency, county } = resolveAgency(absoluteUrl);
        const sourceEventId = hashId(`${agency}|${text}`);
        rows.push({
          sourceEventId,
          title: text,
          sourceUrl: absoluteUrl,
          agency,
          county,
          postedDate: null,
        });
      });

      if (rows.length === 0) return [];

      // Geofence: every row is TX. Filter defensively.
      const geofenced = rows.filter((r) => isInZedcorGeofence('TX'));

      // Top-5 most-recent (posted_date desc). Posted_date is null here, so
      // we keep listing order — the OBO page lists most-relevant portals first.
      const detailUrls = geofenced.slice(0, 5).map((r) => r.sourceUrl);
      const postedDates: Record<string, string | null> = {};
      for (const r of geofenced.slice(0, 5)) postedDates[r.sourceUrl] = r.postedDate;

      let upgrades: Awaited<ReturnType<typeof enrichDetailPages>>['upgrades'] = new Map();
      if (detailUrls.length > 0) {
        const result = await enrichDetailPages({
          detail_urls: detailUrls,
          fetchImpl: opts.fetch,
          posted_dates: postedDates,
        });
        upgrades = result.upgrades;
      }

      const events: SourceEvent[] = [];
      for (const r of geofenced) {
        let payload: Record<string, unknown> = {
          agency: r.agency,
          city: 'Houston',
          county: r.county,
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: null,
          estimated_value: null,
          source_authority: 'public_construction',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
        };
        const upgrade = upgrades.get(r.sourceUrl);
        if (upgrade) {
          payload = applyEnrichmentToPayload(payload, upgrade);
        }

        events.push(
          buildEvent({
            source_event_id: r.sourceEventId,
            title: r.title,
            summary: null,
            posted_date: r.postedDate,
            raw_payload: payload,
          }),
        );
      }

      return events;
    } catch {
      return [];
    }
  },
};
