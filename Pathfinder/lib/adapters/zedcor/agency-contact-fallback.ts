// lib/adapters/zedcor/agency-contact-fallback.ts
//
// Z17.2 — Free agency-contact fallback.
//
// When a row is pre-window (no GC selected yet) or its GC contact can't be
// resolved by Z3.5 GC-extraction or Z7's three-layer external resolver, the
// rep is left without a callable contact in the Lead Feed. For pre-award
// solicitation rows that is structurally correct (the GC is the *future*
// awardee), but the rep CAN still call the agency's procurement office to:
//   - confirm the bid is live + ask for the spec docs
//   - learn who the likely primes/GCs are
//   - position Zedcor for the post-award sub-bid window
//
// This file hard-codes the procurement-department contact for each Texas/
// Houston-area source slug we poll. Every entry comes from the agency's
// public procurement / purchasing web page. Department-level only — no
// individual names — so we avoid putting private contact info in version
// control.
//
// Adding a new source? Append the entry below and the orchestrator picks
// it up automatically.
//
// Out of scope (free-data ladder): Google News search for the project,
// LinkedIn enrichment of the agency's purchasing officer, GC corporate-
// website contact-page scraping. Those ship under Z17.3+.

export interface AgencyContact {
  agency_name: string;
  contact_name: string | null;      // Department, not individual.
  contact_role: string;
  contact_email: string | null;
  contact_phone: string | null;
  source_url: string;               // The page we copied the contact from.
}

// Keyed by `pathfinder.projects.source` slug (the same slug the orchestrator
// runs via SOURCE_ADAPTERS).
const FALLBACK: Record<string, AgencyContact> = {
  'harris-county-bonfire': {
    agency_name: 'Harris County Purchasing',
    contact_name: 'Purchasing Agent Office',
    contact_role: 'Procurement',
    contact_email: 'purchasingweb@hctx.net',
    contact_phone: '(713) 274-4400',
    source_url: 'https://purchasing.harriscountytx.gov/Pages/contactus.aspx',
  },
  'houston-obo': {
    agency_name: 'City of Houston Office of Business Opportunity',
    contact_name: 'OBO Procurement Help Desk',
    contact_role: 'Procurement',
    contact_email: 'obo@houstontx.gov',
    contact_phone: '(832) 393-0600',
    source_url: 'https://www.houstontx.gov/obo/contactus.html',
  },
  'houston-public-works': {
    agency_name: 'Houston Public Works',
    contact_name: 'HPW Procurement Office',
    contact_role: 'Procurement',
    contact_email: null,
    contact_phone: '(832) 395-2400',
    source_url: 'https://www.houstonpublicworks.org/contact-us',
  },
  'houston-metro': {
    agency_name: 'METRO Houston (Metropolitan Transit Authority)',
    contact_name: 'METRO Procurement Department',
    contact_role: 'Procurement',
    contact_email: 'procurement@ridemetro.org',
    contact_phone: '(713) 739-4700',
    source_url: 'https://www.ridemetro.org/about/procurement',
  },
  'port-houston': {
    agency_name: 'Port Houston',
    contact_name: 'Port Houston Contracts',
    contact_role: 'Procurement',
    contact_email: 'contracts@porthouston.com',
    contact_phone: '(713) 670-2400',
    source_url: 'https://porthouston.com/about-us/procurement/',
  },
  'fort-bend-county': {
    agency_name: 'Fort Bend County Purchasing',
    contact_name: 'Fort Bend County Purchasing Department',
    contact_role: 'Procurement',
    contact_email: 'purchasing@fortbendcountytx.gov',
    contact_phone: '(281) 341-8700',
    source_url: 'https://www.fortbendcountytx.gov/government/departments/financial-administration/purchasing',
  },
  'galveston-county': {
    agency_name: 'Galveston County Purchasing',
    contact_name: 'Galveston County Purchasing Department',
    contact_role: 'Procurement',
    contact_email: 'purchasing@co.galveston.tx.us',
    contact_phone: '(409) 766-2244',
    source_url: 'https://www.galvestoncountytx.gov/pu',
  },
  'brazoria-county': {
    agency_name: 'Brazoria County Purchasing',
    contact_name: 'Brazoria County Purchasing Department',
    contact_role: 'Procurement',
    contact_email: 'purchasing@brazoria-county.com',
    contact_phone: '(979) 864-1600',
    source_url: 'https://www.brazoriacountytx.gov/departments/purchasing',
  },
  'hisd-ionwave': {
    agency_name: 'Houston ISD Procurement Services',
    contact_name: 'Houston ISD Procurement Services',
    contact_role: 'Procurement',
    contact_email: 'procurement@houstonisd.org',
    contact_phone: '(713) 556-7400',
    source_url: 'https://www.houstonisd.org/Page/204800',
  },
  'txdot-houston-district': {
    agency_name: 'TxDOT Houston District',
    contact_name: 'TxDOT Houston District Procurement',
    contact_role: 'Procurement',
    contact_email: null,
    contact_phone: '(713) 802-5000',
    source_url: 'https://www.txdot.gov/about/districts/houston.html',
  },
  // Texas hub expansion (Z16)
  'austin-eresponse': {
    agency_name: 'City of Austin Purchasing',
    contact_name: 'City of Austin Purchasing Office',
    contact_role: 'Procurement',
    contact_email: 'purchasing@austintexas.gov',
    contact_phone: '(512) 974-2500',
    source_url: 'https://www.austintexas.gov/department/purchasing-office',
  },
  'san-antonio-city': {
    agency_name: 'City of San Antonio Finance / Purchasing',
    contact_name: 'COSA Purchasing Division',
    contact_role: 'Procurement',
    contact_email: 'purchasing@sanantonio.gov',
    contact_phone: '(210) 207-7240',
    source_url: 'https://www.sa.gov/Directory/Departments/Finance/Purchasing',
  },
  'port-corpus-christi': {
    agency_name: 'Port of Corpus Christi Authority',
    contact_name: 'PCCA Procurement',
    contact_role: 'Procurement',
    contact_email: 'pccainfo@pocca.com',
    contact_phone: '(361) 882-5633',
    source_url: 'https://portofcc.com/about-us/contact-us/',
  },
  'fort-worth-bonfire': {
    agency_name: 'City of Fort Worth Purchasing',
    contact_name: 'Fort Worth Purchasing Division',
    contact_role: 'Procurement',
    contact_email: 'purchasing@fortworthtexas.gov',
    contact_phone: '(817) 392-2580',
    source_url: 'https://www.fortworthtexas.gov/departments/financial-management-services/purchasing',
  },
  'fort-worth-city': {
    agency_name: 'City of Fort Worth Purchasing',
    contact_name: 'Fort Worth Purchasing Division',
    contact_role: 'Procurement',
    contact_email: 'purchasing@fortworthtexas.gov',
    contact_phone: '(817) 392-2580',
    source_url: 'https://www.fortworthtexas.gov/departments/financial-management-services/purchasing',
  },
};

/** Lookup the agency procurement contact for a `pathfinder.projects.source`
 *  slug. Returns null when we don't have a fallback for that source — caller
 *  degrades gracefully (the recommended_action just omits the "Contact:" line). */
export function getAgencyContact(sourceSlug: string | null | undefined): AgencyContact | null {
  if (!sourceSlug) return null;
  return FALLBACK[sourceSlug] ?? null;
}

/** Short one-line "Agency — Phone (Email)" snippet for embedding inside a
 *  recommended_action string. Returns empty string when no contact is known
 *  so callers can concat without a guard. */
export function agencyContactSnippet(sourceSlug: string | null | undefined): string {
  const c = getAgencyContact(sourceSlug);
  if (!c) return '';
  const parts: string[] = [c.agency_name];
  if (c.contact_phone) parts.push(c.contact_phone);
  if (c.contact_email) parts.push(c.contact_email);
  return parts.join(' · ');
}
