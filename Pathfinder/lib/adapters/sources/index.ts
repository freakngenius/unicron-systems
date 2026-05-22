// lib/adapters/sources/index.ts
//
// Funder onboarding Stage 3 — id-keyed SOURCE_ADAPTERS registry.
//
// This is the new dispatch surface consumed by the Inngest subscriber at
// lib/inngest/functions/ingest-org-requested.ts. Each registered adapter
// implements the SourceAdapter contract from ./types and is keyed by its
// source id (the same id that appears in architecture.sources[].id).
//
// Coexistence note: the existing kind-keyed ADAPTERS registry in
// lib/adapters/index.ts (socrata/rest/rss/json-dump/custom) remains
// untouched and continues to serve the Source Onboarder agent's
// generated-code flow. The two registries answer different questions:
//   ADAPTERS[kind]            → "give me the runtime for kind X"
//                              (Source Onboarder, per-data-source-row dispatch)
//   SOURCE_ADAPTERS[source_id] → "run source X for this org now"
//                              (per-org ingest subscriber, Funder + future orgs)
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.

import type { SourceAdapter } from './types';
import { propublicaNonprofitExplorerAdapter } from './propublica-nonprofit-explorer';
import { irsExemptOrgFilingsAdapter } from './irs-exempt-org-filings';
import { eaForumRssAdapter } from './ea-forum-rss';
import { philanthropyTradePressRssAdapter } from './philanthropy-trade-press-rss';
import { acceleratorCohortPagesAdapter } from './accelerator-cohort-pages';
import { businessLicenseIssuancesAdapter } from './business-license-issuances';
import { funder990FilingsAdapter } from './funder-990-filings';
// Internal onboarding Stage 5 — six adapter scaffolds for org slug
// 'internal' (Pathfinder organization #4). Registrations below are
// strictly additive; Funder entries above are untouched.
import { samGovEntityAdapter } from './sam-gov-entity';
import { usaspendingRecipientsAdapter } from './usaspending-recipients';
import { constructionSalesJobPostingsAdapter } from './construction-sales-job-postings';
import { tradeAssociationDirectoriesAdapter } from './trade-association-directories';
import { sosBusinessRegistrationsAdapter } from './sos-business-registrations';
import { stateContractorLicensesAdapter } from './state-contractor-licenses';

export type { SourceAdapter, SourceAdapterType, SourceEvent, SourcePollOptions } from './types';

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  [propublicaNonprofitExplorerAdapter.id]: propublicaNonprofitExplorerAdapter,
  [irsExemptOrgFilingsAdapter.id]: irsExemptOrgFilingsAdapter,
  [eaForumRssAdapter.id]: eaForumRssAdapter,
  [philanthropyTradePressRssAdapter.id]: philanthropyTradePressRssAdapter,
  [acceleratorCohortPagesAdapter.id]: acceleratorCohortPagesAdapter,
  [businessLicenseIssuancesAdapter.id]: businessLicenseIssuancesAdapter,
  [funder990FilingsAdapter.id]: funder990FilingsAdapter,
  // Internal Stage 5 adapters.
  [samGovEntityAdapter.id]: samGovEntityAdapter,
  [usaspendingRecipientsAdapter.id]: usaspendingRecipientsAdapter,
  [constructionSalesJobPostingsAdapter.id]: constructionSalesJobPostingsAdapter,
  [tradeAssociationDirectoriesAdapter.id]: tradeAssociationDirectoriesAdapter,
  [sosBusinessRegistrationsAdapter.id]: sosBusinessRegistrationsAdapter,
  [stateContractorLicensesAdapter.id]: stateContractorLicensesAdapter,
};

/** Look up an adapter by source id. Returns null when unregistered. */
export function getSourceAdapter(id: string): SourceAdapter | null {
  return SOURCE_ADAPTERS[id] ?? null;
}
