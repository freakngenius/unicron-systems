// lib/adapters/sources/txdot-houston-district.ts
//
// Sprint Z3 adapter — TxDOT Houston District.
//
// STRATEGY DEFERRED TO Z4.
//
// Investigation (2026-05-28):
//   - https://www.txdot.gov/about/districts/houston.html → HTTP 404.
//   - https://www.txdot.gov/about/districts/houston-district.html → renders, but
//     is pure district contact/nav. No opportunities embedded in the HTML.
//   - https://www.txdot.gov/business/road-bridge-maintenance/contract-letting.html
//     is the statewide letting hub. It does not list individual projects; it
//     directs bidders to Tableau dashboards
//     (tableau.txdot.gov/views/ProjectInformationDashboard,
//     tableau.txdot.gov/views/Plan24MonthLettingSchedule) and to the
//     Electronic Bidding System (EBS). Both are interactive
//     non-HTML-scrapable surfaces (Tableau Vizql, authenticated EBS).
//   - The actual Houston-district letting docs (Notice to Contractors,
//     plansets, bid tabs) are published as PDFs from the FTP site
//     (ftp.dot.state.tx.us). PDF parsing is out of scope for Z3.
//
// Until Z4 builds either a Tableau Vizql client or an FTP/PDF parser,
// this adapter returns []. We still emit the canonical SourceAdapter shape
// so the orchestrator registers the source and source_failed never fires.

import type { SourceAdapter, SourceEvent } from './types';

export const txdotHoustonDistrictAdapter: SourceAdapter = {
  id: 'txdot-houston-district',
  type: 'registered',
  description:
    'TxDOT Houston District (deferred to Z4 — letting is Tableau/EBS/PDF-only, no scrapable HTML).',

  async poll(_opts): Promise<SourceEvent[]> {
    // Intentional no-op. See file header for the Z4 deferral rationale.
    return [];
  },
};
