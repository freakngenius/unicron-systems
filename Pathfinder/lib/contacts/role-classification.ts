// lib/contacts/role-classification.ts — Demo Polish UX Gate 8A.
//
// Deterministic role + owner_type → decision_authority + seniority mapping.
// Spec: `Company Docs/Specs/SPEC - Contact Enrichment.md` § Decision authority
// inference + § Enrichment logic role priorities.
//
// Pure, side-effect-free. Single source of truth so the contact-enricher
// orchestrator and (future) UI can both reference it. Tunable: edit the
// matchers below.

import type {
  DecisionAuthority,
  Seniority,
} from '@/services/contact-enricher/providers/types';
import type { OwnerType } from '@/services/enricher/types';

const lower = (s: string | null | undefined): string => (s ?? '').toLowerCase();

// Seniority is determined by role title alone — owner_type doesn't change
// what "VP" means. Order matters: c_suite checked before VP, etc.
export function classifySeniority(role: string | null | undefined): Seniority {
  const r = lower(role);
  if (!r) return 'unknown';

  // C-suite: CEO, CFO, COO, CTO, CIO, CSO, President, Owner, Founder.
  // "President" only counts when not preceded by "vice " — otherwise
  // "Vice President" gets misclassified as c_suite instead of vp.
  if (
    /\b(ceo|cfo|coo|cto|cio|cso|chief\s+\w+\s+officer|owner|founder|principal)\b/.test(
      r,
    ) ||
    /(?<!vice\s)\bpresident\b/.test(r)
  ) {
    return 'c_suite';
  }

  // VP / SVP / EVP / AVP. AVP is grouped with VP for buying-authority purposes;
  // the spec's signer rules treat VP+ as signer when in the right domain.
  if (/\b(s?vp|evp|avp|vice\s+president)\b/.test(r)) return 'vp';

  // Director / Head of / Lead. "Head of Security" is director-tier signer-ish.
  if (/\b(director|head\s+of|department\s+head)\b/.test(r)) return 'director';

  // Manager / Supervisor / Foreman / Officer (incl. "Procurement Officer").
  if (/\b(manager|supervisor|foreman|officer|administrator)\b/.test(r)) {
    return 'manager';
  }

  // Anything else is IC-level (engineer, analyst, coordinator, assistant).
  if (
    /\b(engineer|analyst|coordinator|assistant|specialist|technician|associate|representative)\b/.test(
      r,
    )
  ) {
    return 'individual_contributor';
  }

  return 'unknown';
}

// Domain matchers — used to decide if a role sits in the spec's
// signer-eligible buying domains (Facilities / Construction / Operations /
// Real Estate / Capital Projects / Public Works).
// Domain matchers use leading word-boundary + open-ended suffix so that
// "facilities" / "facility" / "operations" / "operational" all match
// without listing every inflection. Trailing `\b` deliberately omitted —
// otherwise `\bfacilit\b` fails on "facilities".
function isFacilitiesConstructionOpsRealEstate(role: string): boolean {
  const r = lower(role);
  return (
    /\bfacilit/.test(r) ||
    /\bconstruction/.test(r) ||
    /\boperations?\b/.test(r) ||
    /\bops\b/.test(r) ||
    /\breal\s+estate\b/.test(r) ||
    /\bcapital\s+projects?\b/.test(r) ||
    /\bpublic\s+works\b/.test(r) ||
    /\basset\s+management\b/.test(r) ||
    /\binfrastructure\b/.test(r)
  );
}

function isSecurityChampion(role: string): boolean {
  const r = lower(role);
  return (
    /\bsecurity\b/.test(r) ||
    /\bloss\s+prevention\b/.test(r) ||
    /\brisk\s+manager\b/.test(r) ||
    /\bpublic\s+safety\b/.test(r)
  );
}

function isGatekeeper(role: string): boolean {
  const r = lower(role);
  return (
    /\bprocurement\b/.test(r) ||
    /\bbuyer\b/.test(r) ||
    /\bpurchasing\b/.test(r) ||
    /\bexecutive\s+assistant\b/.test(r) ||
    /\bchief\s+of\s+staff\b/.test(r) ||
    /\bcontracting\s+officer\b/.test(r)
  );
}

function isInfluencerProjectRole(role: string): boolean {
  const r = lower(role);
  return (
    /\bproject\s+manager\b/.test(r) ||
    /\bconstruction\s+manager\b/.test(r) ||
    /\bowner'?s?\s+rep\b/.test(r) ||
    /\bprogram\s+manager\b/.test(r) ||
    /\bcapital\s+projects?\s+manager\b/.test(r) ||
    /\bproject\s+executive\b/.test(r)
  );
}

// CFO is signer-tier when the project is large; this helper just signals
// "CFO-shaped role". Caller passes project_value separately if it wants the
// $5M gate per spec.
function isCfo(role: string): boolean {
  return /\bcfo\b|\bchief\s+financial\s+officer\b/.test(lower(role));
}

export interface ClassifyDecisionAuthorityArgs {
  role: string | null | undefined;
  owner_type?: OwnerType | string | null;
  // Optional context — when present, lifts CFO into signer per spec
  // ($5M+ project value gate).
  project_value_usd?: number | null;
}

// The spec's classification matrix:
//
// Champion   = security / loss-prevention / risk / public-safety roles.
//              These care about Zedcor's value prop directly.
// Signer     = VP+ in facilities/construction/ops/real-estate; Public
//              Works Director; Capital Projects Director; CFO when
//              project_value > $5M.
// Influencer = Director-level in same domains; PM / CM / Owner's Rep.
// Gatekeeper = Procurement Officer; Buyer; EA; Chief of Staff;
//              Contracting Officer.
// Unknown    = anything else.
//
// Champion check runs FIRST so a "Director of Security" classifies as
// champion, not influencer — Zedcor reps want security roles flagged
// distinctively even when they're director-tier.
export function classifyDecisionAuthority(
  args: ClassifyDecisionAuthorityArgs,
): DecisionAuthority {
  const { role, project_value_usd } = args;
  const r = lower(role);
  if (!r) return 'unknown';

  if (isSecurityChampion(r)) return 'champion';
  if (isGatekeeper(r)) return 'gatekeeper';

  const seniority = classifySeniority(r);

  // CFO with a big-enough project becomes signer per spec. CFO without
  // value context falls through to influencer-tier (financial review of a
  // smaller deal).
  if (isCfo(r)) {
    if (project_value_usd != null && project_value_usd > 5_000_000) {
      return 'signer';
    }
    return 'influencer';
  }

  // VP+ in the right domain is signer.
  if (
    (seniority === 'vp' || seniority === 'c_suite') &&
    isFacilitiesConstructionOpsRealEstate(r)
  ) {
    return 'signer';
  }

  // Public Works Director / Capital Projects Director are signer regardless
  // of seniority phrasing — they own the budget for these projects.
  if (
    /\b(public\s+works\s+director|capital\s+projects?\s+director)\b/.test(r)
  ) {
    return 'signer';
  }

  // Director-level in the right domain → influencer.
  if (
    seniority === 'director' &&
    isFacilitiesConstructionOpsRealEstate(r)
  ) {
    return 'influencer';
  }

  // Project-level roles → influencer.
  if (isInfluencerProjectRole(r)) return 'influencer';

  return 'unknown';
}

// Spec § Enrichment logic step 1 — "prioritize roles that match security
// buying authority" matrix, keyed by owner_type. Used by the orchestrator
// to bias the provider query toward roles likely to matter.
export function priorityRolesForOwnerType(
  ownerType: OwnerType | string | null | undefined,
): string[] {
  const t = lower(ownerType);
  switch (t) {
    case 'federal_agency':
    case 'state_agency':
    case 'municipality':
      return [
        'District Security Manager',
        'Facilities Director',
        'Public Works Director',
        'Procurement Officer',
        'Capital Projects Director',
      ];
    case 'pe_firm':
    case 'reit':
      return [
        'VP Facilities',
        'VP Construction',
        'Director of Real Estate',
        'Head of Security',
        'Asset Manager',
      ];
    case 'university':
      return [
        'Director of Public Safety',
        'AVP Facilities',
        'Capital Projects Director',
        'Director of Construction',
      ];
    case 'private_developer':
      return [
        'Project Executive',
        'Construction Manager',
        "Owner's Rep",
        'VP Construction',
      ];
    case 'nonprofit':
    case 'other':
    default:
      // Hospitals are not a distinct owner_type in the current taxonomy;
      // they tend to surface as 'other' or 'private_developer'. Spec
      // calls for the hospital priority list when the org name suggests
      // it; that disambiguation lives in the orchestrator prompt building,
      // not here. Default = a useful generalist list.
      return [
        'VP Facilities',
        'Director of Construction',
        'Director of Security',
        'Head of Real Estate',
        'Procurement Officer',
      ];
  }
}
