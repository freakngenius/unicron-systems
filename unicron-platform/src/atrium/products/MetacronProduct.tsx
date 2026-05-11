// MetacronProduct.tsx — Pass 3 of the Metacron → Atrium rebrand.
//
// Renders the full embedded Metacron operator app inside the Atrium
// Products → Metacron tab. Atrium provides the rail + header; this
// component is just the mount point.
//
// History:
//  - Pass 1 (#293): introduced <MetacronEmbedded /> mount underneath a
//    summary header (Agent Fleet cards + Architect Proposals This Week +
//    KPI panel).
//  - Pass 2 (#297): components inside the embed migrated to Atrium tokens.
//  - Pass 3 (this file): the summary content was duplication. Folded into
//    Metacron's own tabs:
//      • Agent Fleet → <AgentsView> as <FleetSummary />
//      • Architect Proposals This Week → <ArchitectInbox> as <ProposalsThisWeek />
//    The KPI panel was retired from this surface; the underlying
//    unicron-knowledge/wiki/products/metacron/kpis.md vault is still
//    edited via the GitHub link in the wiki and surfaces inside the
//    Library tab.

import { MetacronEmbedded } from '../../App';

export function MetacronProduct() {
  return <MetacronEmbedded />;
}
