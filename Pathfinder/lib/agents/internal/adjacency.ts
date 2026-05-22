// lib/agents/internal/adjacency.ts
//
// Internal onboarding Stage 5 — Internal adjacency-mapper (INACTIVE
// without seed file).
//
// Blueprint §10 decision 5: the Internal adjacency model depends on an
// external seed file Kyle / Curtis maintain off-platform. Expected seed
// shape (JSON):
//
//   {
//     "unicron_customers": [
//       { "name": "Zedcor", "state": "TX", "service_category": "site-safety-services" },
//       ...
//     ],
//     "crm_contacts": [
//       { "name": "Jane Doe", "company": "Acme Site Services", "title": "VP Sales", "linkedin_url": "..." },
//       ...
//     ],
//     "trade_associations": [
//       { "association": "ARA", "company": "Acme Site Services", "joined_year": 2019 },
//       ...
//     ]
//   }
//
// When UNICRON_INTERNAL_ADJACENCY_SEED_PATH is set, the seed is loaded
// once and used to compute warm-intro paths for each candidate company:
//   - customer_overlap: shared state + service category with an existing
//     Unicron customer (e.g. "Zedcor operates in TX too, same vertical").
//   - crm_contact_match: direct CRM contact whose company matches the
//     candidate (warm intro via a known person).
//   - association_overlap: shared trade-association membership.
//
// When the env var is unset (the default state at Stage 5), the
// adjacency-mapper short-circuits to an empty result. The code path is
// fully implemented so Stage 9 onward can flip it on by exporting the
// seed without further code changes.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §10 decision 5.

import { readFile } from 'node:fs/promises';

export interface InternalAdjacencyInput {
  project_id: string;
  title: string;
  service_category?: string | null;
  hq_state?: string | null;
  operating_states?: string[];
  /** Override for tests — bypasses the env var + filesystem read. */
  seedOverride?: InternalAdjacencySeed;
}

export interface InternalAdjacencySeed {
  unicron_customers: Array<{ name: string; state?: string; service_category?: string }>;
  crm_contacts: Array<{ name: string; company: string; title?: string; linkedin_url?: string; email?: string }>;
  trade_associations: Array<{ association: string; company: string; joined_year?: number }>;
}

export interface InternalAdjacencyResult {
  project_id: string;
  active: boolean;
  customer_overlap: Array<{ customer_name: string; basis: string }>;
  crm_contact_match: Array<{ name: string; title?: string; linkedin_url?: string; email?: string }>;
  association_overlap: Array<{ association: string; via: string }>;
}

let _cachedSeed: { path: string; seed: InternalAdjacencySeed } | null = null;

async function loadSeedFromEnv(): Promise<InternalAdjacencySeed | null> {
  const path = process.env.UNICRON_INTERNAL_ADJACENCY_SEED_PATH;
  if (!path) return null;
  if (_cachedSeed && _cachedSeed.path === path) return _cachedSeed.seed;
  try {
    const buf = await readFile(path, 'utf8');
    const parsed = JSON.parse(buf) as Partial<InternalAdjacencySeed>;
    const seed: InternalAdjacencySeed = {
      unicron_customers: Array.isArray(parsed.unicron_customers) ? parsed.unicron_customers : [],
      crm_contacts: Array.isArray(parsed.crm_contacts) ? parsed.crm_contacts : [],
      trade_associations: Array.isArray(parsed.trade_associations) ? parsed.trade_associations : [],
    };
    _cachedSeed = { path, seed };
    return seed;
  } catch (err) {
    // Treat a missing or unparseable seed as inert rather than throwing.
    // Operators will see the empty result in the logs.
    console.warn(
      '[internal.adjacency] failed to load seed at',
      path,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function emptyResult(project_id: string, active: boolean): InternalAdjacencyResult {
  return {
    project_id,
    active,
    customer_overlap: [],
    crm_contact_match: [],
    association_overlap: [],
  };
}

function normalize(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().replace(/[\s,.&'-]+/g, ' ').trim();
}

/**
 * Compute warm-intro adjacency for an Internal candidate company.
 *
 * Inert when no seed override is supplied AND
 * UNICRON_INTERNAL_ADJACENCY_SEED_PATH is unset — returns an empty
 * result with active=false so callers can persist the bookkeeping
 * without triggering a false positive.
 */
export async function findInternalAdjacency(
  input: InternalAdjacencyInput,
): Promise<InternalAdjacencyResult> {
  const seed = input.seedOverride ?? (await loadSeedFromEnv());
  if (!seed) {
    return emptyResult(input.project_id, false);
  }

  const titleNorm = normalize(input.title);
  const stateSet = new Set<string>();
  if (input.hq_state) stateSet.add(input.hq_state.toUpperCase());
  for (const s of input.operating_states ?? []) stateSet.add(s.toUpperCase());

  // Customer overlap: same state + (same service_category OR no category
  // specified on either side, in which case state alone is the basis).
  const customer_overlap: InternalAdjacencyResult['customer_overlap'] = [];
  for (const cust of seed.unicron_customers) {
    if (!cust.name) continue;
    const custState = (cust.state ?? '').toUpperCase();
    const stateMatch = custState && stateSet.has(custState);
    const catMatch =
      cust.service_category &&
      input.service_category &&
      cust.service_category === input.service_category;
    if (stateMatch && (catMatch || !cust.service_category || !input.service_category)) {
      const basisParts: string[] = [];
      if (stateMatch) basisParts.push(`state=${custState}`);
      if (catMatch) basisParts.push(`category=${cust.service_category}`);
      customer_overlap.push({
        customer_name: cust.name,
        basis: basisParts.join('+'),
      });
    }
  }

  // CRM contact match: candidate.title (company name) matches a CRM
  // contact's company. Loose case-insensitive substring match.
  const crm_contact_match: InternalAdjacencyResult['crm_contact_match'] = [];
  for (const contact of seed.crm_contacts) {
    if (!contact.name || !contact.company) continue;
    const cNorm = normalize(contact.company);
    if (!cNorm) continue;
    if (titleNorm.includes(cNorm) || cNorm.includes(titleNorm)) {
      crm_contact_match.push({
        name: contact.name,
        title: contact.title,
        linkedin_url: contact.linkedin_url,
        email: contact.email,
      });
    }
  }

  // Association overlap: candidate company name matches a trade-association
  // membership row.
  const association_overlap: InternalAdjacencyResult['association_overlap'] = [];
  for (const row of seed.trade_associations) {
    if (!row.association || !row.company) continue;
    const cNorm = normalize(row.company);
    if (!cNorm) continue;
    if (titleNorm.includes(cNorm) || cNorm.includes(titleNorm)) {
      association_overlap.push({
        association: row.association,
        via: row.company,
      });
    }
  }

  return {
    project_id: input.project_id,
    active: true,
    customer_overlap,
    crm_contact_match,
    association_overlap,
  };
}

/** Exposed for tests. Clears the cached seed parse. */
export function _resetAdjacencyCache(): void {
  _cachedSeed = null;
}
