// services/contact-enricher/agent.ts — Demo Polish UX Gate 8B.
//
// Orchestrator for the Contact Enrichment Engine. Spec:
// `Company Docs/Specs/SPEC - Contact Enrichment.md`. Composes the three
// providers shipped in 8B:
//
//   1. Clay (primary) → enrichContacts
//   2. Apollo (fallback) → enrichContacts when Clay returns < 3 contacts
//      OR when every Clay contact has null email AND null phone
//   3. Hunter (verifier) → upgrade email_status from 'guessed' to
//      'verified'/'invalid' before write
//
// Then deduplicates, classifies decision_authority, ranks, applies the
// per-project 5-contact cap, and persists to pathfinder.lead_contacts.
//
// Skip rules (per spec § Enrichment logic step 6):
//   - owner_name is null OR equals 'Pre-award (no awardee yet)'
//   - rejection_reason is not null
//   - lead's nearest branch already serves the owner (cross-pollination
//     handles the warm-intro path; redundant)

import {
  classifyDecisionAuthority,
  classifySeniority,
  priorityRolesForOwnerType,
} from '@/lib/contacts/role-classification';
import { ApolloContactEnricher } from './providers/apollo';
import { ClayContactEnricher } from './providers/clay';
import { HunterEmailVerifier } from './providers/hunter';
import type {
  ContactEnricher,
  EmailVerifier,
  EnrichRequest,
  EnrichResult,
  EnrichedContact,
} from './providers/types';

export const PER_PROJECT_CONTACT_CAP = 5;
const MIN_CLAY_CONTACTS_BEFORE_FALLBACK = 3;

export type SkipReason =
  | 'owner_unknown'
  | 'pre_award'
  | 'rejected'
  | 'cross_pollination_serves_owner';

export interface EnrichLeadInput {
  project_id: string;
  owner_name: string | null;
  owner_type: string | null;
  location_text?: string | null;
  naics_code?: string | null;
  rejection_reason?: string | null;
  // Caller signals that the lead's nearest branch already serves this
  // owner (resolved via lib/cross-poll-fetch). When true, the orchestrator
  // returns SkipResult({reason:'cross_pollination_serves_owner'}).
  cross_pollination_serves_owner?: boolean;
  // Optional context for classification. CFO becomes signer when value > $5M.
  project_value_usd?: number | null;
}

export interface EnrichmentMeta {
  clay: EnrichResult['meta'] | null;
  apollo: EnrichResult['meta'] | null;
  hunter_calls: number;
  hunter_cost_usd: number;
  hunter_verified: number;
  hunter_invalidated: number;
}

export interface EnrichLeadResult {
  status: 'enriched' | 'empty' | 'skipped' | 'partial';
  contacts: EnrichedContact[];
  skip_reason: SkipReason | null;
  total_cost_usd: number;
  meta: EnrichmentMeta;
}

function normalizeOwnerName(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'pre-award (no awardee yet)') return null;
  return trimmed;
}

function shouldSkip(input: EnrichLeadInput): SkipReason | null {
  if (input.rejection_reason) return 'rejected';
  if (input.cross_pollination_serves_owner) return 'cross_pollination_serves_owner';
  const ownerLc = (input.owner_name ?? '').toLowerCase();
  if (ownerLc === 'pre-award (no awardee yet)') return 'pre_award';
  if (!normalizeOwnerName(input.owner_name)) return 'owner_unknown';
  return null;
}

// Apollo-fallback gate per spec: trigger when Clay returns <3 contacts OR
// when every contact lacks both email AND phone.
export function shouldFallbackToApollo(clay: EnrichResult): boolean {
  if (clay.contacts.length < MIN_CLAY_CONTACTS_BEFORE_FALLBACK) return true;
  const allEmpty = clay.contacts.every((c) => !c.email && !c.phone);
  return allEmpty;
}

export function dedupeContacts(contacts: EnrichedContact[]): EnrichedContact[] {
  // Key on normalized name only — the same person can surface across
  // providers with different email read-states (one null, one guessed,
  // one verified). Keying on name+email would treat those as distinct
  // and inflate the cap. Provider-specific contradictions (two different
  // people sharing a name) are rare enough that the merge collision is
  // acceptable; if a downstream gate needs sharper disambiguation we can
  // add an org-domain check.
  const seen = new Map<string, EnrichedContact>();
  for (const c of contacts) {
    const key = c.contact_name.trim().toLowerCase();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, c);
      continue;
    }
    // Merge: prefer the row with verified email; tie-break on
    // source_confidence; tie-break again on richer phone presence.
    const cVerified = c.email_status === 'verified';
    const exVerified = existing.email_status === 'verified';
    let better = false;
    if (cVerified && !exVerified) {
      better = true;
    } else if (cVerified === exVerified) {
      const cConf = c.source_confidence ?? -1;
      const exConf = existing.source_confidence ?? -1;
      if (cConf > exConf) {
        better = true;
      } else if (cConf === exConf && c.phone && !existing.phone) {
        better = true;
      }
    }
    if (better) seen.set(key, c);
  }
  return Array.from(seen.values());
}

const DECISION_AUTHORITY_RANK: Record<string, number> = {
  signer: 0,
  champion: 1,
  influencer: 2,
  gatekeeper: 3,
  unknown: 4,
};
const SENIORITY_RANK: Record<string, number> = {
  c_suite: 0,
  vp: 1,
  director: 2,
  manager: 3,
  individual_contributor: 4,
  unknown: 5,
};

export function rankAndCap(
  contacts: EnrichedContact[],
  cap = PER_PROJECT_CONTACT_CAP,
): EnrichedContact[] {
  const sorted = [...contacts].sort((a, b) => {
    const da =
      DECISION_AUTHORITY_RANK[a.decision_authority ?? 'unknown'] ?? 99;
    const db =
      DECISION_AUTHORITY_RANK[b.decision_authority ?? 'unknown'] ?? 99;
    if (da !== db) return da - db;
    const sa = SENIORITY_RANK[a.seniority ?? 'unknown'] ?? 99;
    const sb = SENIORITY_RANK[b.seniority ?? 'unknown'] ?? 99;
    if (sa !== sb) return sa - sb;
    // Tie-break: verified email beats guessed beats null.
    const ea = a.email_status === 'verified' ? 0 : a.email_status === 'guessed' ? 1 : 2;
    const eb = b.email_status === 'verified' ? 0 : b.email_status === 'guessed' ? 1 : 2;
    return ea - eb;
  });
  return sorted.slice(0, cap);
}

export interface AgentDeps {
  clay?: ContactEnricher;
  apollo?: ContactEnricher;
  hunter?: EmailVerifier;
}

// Enriches one lead. Pure-ish — does not write to the DB. Caller (cron /
// on-demand handler) is responsible for inserting the result into
// pathfinder.lead_contacts.
export async function enrichOneLead(
  input: EnrichLeadInput,
  deps: AgentDeps = {},
): Promise<EnrichLeadResult> {
  const skip = shouldSkip(input);
  if (skip) {
    return {
      status: 'skipped',
      contacts: [],
      skip_reason: skip,
      total_cost_usd: 0,
      meta: {
        clay: null,
        apollo: null,
        hunter_calls: 0,
        hunter_cost_usd: 0,
        hunter_verified: 0,
        hunter_invalidated: 0,
      },
    };
  }
  const ownerName = normalizeOwnerName(input.owner_name)!;
  const clay = deps.clay ?? new ClayContactEnricher();
  const apollo = deps.apollo ?? new ApolloContactEnricher();
  const hunter = deps.hunter ?? new HunterEmailVerifier();

  const req: EnrichRequest = {
    project_id: input.project_id,
    owner_organization: ownerName,
    owner_type: input.owner_type,
    location_text: input.location_text ?? null,
    naics_code: input.naics_code ?? null,
    prioritized_roles: priorityRolesForOwnerType(input.owner_type),
    max_contacts: PER_PROJECT_CONTACT_CAP,
  };

  const clayResult = await clay.enrichContacts(req);
  let apolloResult: EnrichResult | null = null;
  let combined: EnrichedContact[] = [...clayResult.contacts];

  if (shouldFallbackToApollo(clayResult)) {
    apolloResult = await apollo.enrichContacts(req);
    combined = combined.concat(apolloResult.contacts);
  }

  combined = dedupeContacts(combined);

  // Verify guessed emails via Hunter; track stats.
  let hunterCalls = 0;
  let hunterCost = 0;
  let hunterVerified = 0;
  let hunterInvalid = 0;
  for (const c of combined) {
    if (!c.email) continue;
    if (c.email_status === 'verified') continue;
    // Only verify guessed/unknown; invalid stays invalid.
    if (c.email_status === 'invalid') continue;
    const v = await hunter.verifyEmail(c.email);
    hunterCalls += 1;
    hunterCost += v.cost_usd;
    if (v.status === 'verified') {
      c.email_status = 'verified';
      c.last_verified_at = new Date().toISOString();
      hunterVerified += 1;
    } else if (v.status === 'invalid') {
      c.email_status = 'invalid';
      hunterInvalid += 1;
    } else {
      // Hunter says unknown / catch-all → preserve current guessed status.
      if (!c.email_status) c.email_status = 'guessed';
    }
  }

  // Classify decision_authority + (re)classify seniority for any rows
  // the providers left null.
  for (const c of combined) {
    if (!c.seniority || c.seniority === 'unknown') {
      c.seniority = classifySeniority(c.role);
    }
    c.decision_authority = classifyDecisionAuthority({
      role: c.role,
      owner_type: input.owner_type,
      project_value_usd: input.project_value_usd ?? null,
    });
  }

  const ranked = rankAndCap(combined, PER_PROJECT_CONTACT_CAP);

  const total_cost =
    (clayResult.meta.cost_usd ?? 0) +
    (apolloResult?.meta.cost_usd ?? 0) +
    hunterCost;

  let status: EnrichLeadResult['status'];
  if (ranked.length === 0) {
    // Distinguish "providers tried and authoritatively returned 0" from
    // "providers couldn't run". The cron's hard-halt monitor watches
    // for the latter.
    const anyAuthoritative =
      clayResult.authoritative || (apolloResult?.authoritative ?? false);
    status = anyAuthoritative ? 'empty' : 'partial';
  } else {
    status = 'enriched';
  }

  return {
    status,
    contacts: ranked,
    skip_reason: null,
    total_cost_usd: total_cost,
    meta: {
      clay: clayResult.meta,
      apollo: apolloResult?.meta ?? null,
      hunter_calls: hunterCalls,
      hunter_cost_usd: hunterCost,
      hunter_verified: hunterVerified,
      hunter_invalidated: hunterInvalid,
    },
  };
}

export const __test__ = {
  shouldSkip,
  normalizeOwnerName,
};
