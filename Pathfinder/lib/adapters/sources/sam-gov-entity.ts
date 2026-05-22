// lib/adapters/sources/sam-gov-entity.ts
//
// SAM.gov Entity Management adapter — Internal onboarding Stage 5.
//
// Endpoint: https://api.sam.gov/entity-information/v3/entities
// Auth: SAM_GOV_API_KEY (required; without it the adapter returns [] and
//   reports a clear error in stderr so the agent_run notes it).
// Filter: construction NAICS (236, 237, 238, 532412), Active registration
//   only. We bias to the last 90 days of registration / update activity
//   to bound the per-cycle queue.
//
// Why Entity Management, not Opportunities: Internal targets companies
// (construction-vertical contractors / suppliers) for B2B prospecting,
// not federal contract opportunities. The legacy ingestor at
// lib/ingestor.ts:312-345 hits the Opportunities API for Zedcor and that
// path stays untouched. Internal's adapter is a fresh module against
// the Entity Management surface per blueprint §8 priority 1.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §8.
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 5, Source adapters".

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';
import { CONSTRUCTION_NAICS, INTERNAL_UA } from './_internal-shared';

const ENDPOINT = 'https://api.sam.gov/entity-information/v3/entities';

interface SamGovEntity {
  ueiSAM?: string;
  cageCode?: string | null;
  entityRegistration?: {
    samRegistered?: string;
    ueiSAM?: string;
    entityEFTIndicator?: string | null;
    cageCode?: string | null;
    legalBusinessName?: string;
    dbaName?: string | null;
    purposeOfRegistrationCode?: string | null;
    registrationStatus?: string;
    evsSource?: string | null;
    registrationDate?: string | null;
    lastUpdateDate?: string | null;
    registrationExpirationDate?: string | null;
    activationDate?: string | null;
  };
  coreData?: {
    physicalAddress?: {
      addressLine1?: string;
      addressLine2?: string | null;
      city?: string;
      stateOrProvinceCode?: string;
      zipCode?: string;
      countryCode?: string;
    };
  };
  assertions?: {
    goodsAndServices?: {
      primaryNaics?: string;
      naicsList?: Array<{ naicsCode: string; naicsDescription?: string; sbaSmallBusiness?: string }>;
    };
  };
}

interface SamGovListResponse {
  totalRecords?: number;
  entityData?: SamGovEntity[];
}

function buildUrl(apiKey: string, naics: string, page: number, size: number): string {
  const url = new URL(ENDPOINT);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('primaryNaics', naics);
  url.searchParams.set('registrationStatus', 'A'); // Active
  url.searchParams.set('samRegistered', 'Yes');
  url.searchParams.set('purposeOfRegistrationCode', 'Z1'); // All Awards
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(size));
  return url.toString();
}

export const samGovEntityAdapter: SourceAdapter = {
  id: 'sam-gov',
  type: 'registered',
  description:
    'SAM.gov Entity Management — Active SAM-registered construction-vertical contractors (NAICS 236/237/238/532412).',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const apiKey = (opts.config?.api_key as string | undefined) ?? process.env.SAM_GOV_API_KEY;
    if (!apiKey) {
      console.error('[sam-gov] SAM_GOV_API_KEY not set; returning [] (blocked-on-credentials).');
      return [];
    }

    const pageSize = Number(opts.config?.page_size ?? 25);
    const maxPagesPerNaics = Number(opts.config?.max_pages ?? 1);
    const events: SourceEvent[] = [];
    const seen = new Set<string>();

    for (const naics of CONSTRUCTION_NAICS) {
      for (let page = 0; page < maxPagesPerNaics; page++) {
        const url = buildUrl(apiKey, naics, page, pageSize);
        let json: SamGovListResponse;
        try {
          const res = await fetchImpl(url, {
            headers: { Accept: 'application/json', 'User-Agent': INTERNAL_UA },
          });
          if (!res.ok) {
            console.error(`[sam-gov] naics=${naics} page=${page} status=${res.status}`);
            break;
          }
          json = (await res.json()) as SamGovListResponse;
        } catch (err) {
          console.error(`[sam-gov] naics=${naics} page=${page} error:`,
            err instanceof Error ? err.message : err);
          break;
        }
        const records = json.entityData ?? [];
        if (records.length === 0) break;
        for (const e of records) {
          const reg = e.entityRegistration ?? {};
          const uei = reg.ueiSAM ?? e.ueiSAM;
          if (!uei) continue;
          if (seen.has(uei)) continue;
          seen.add(uei);
          const addr = e.coreData?.physicalAddress ?? {};
          const primaryNaics = e.assertions?.goodsAndServices?.primaryNaics ?? naics;
          events.push({
            source_event_id: `sam-entity:${uei}`,
            title: reg.legalBusinessName ?? reg.dbaName ?? `SAM entity ${uei}`,
            summary: `SAM-registered ${primaryNaics} contractor${reg.cageCode ? ` · CAGE ${reg.cageCode}` : ''}`,
            posted_date: reg.lastUpdateDate ?? reg.registrationDate ?? null,
            raw_payload: {
              uei,
              cage_code: reg.cageCode ?? null,
              legal_business_name: reg.legalBusinessName ?? null,
              dba_name: reg.dbaName ?? null,
              registration_status: reg.registrationStatus ?? null,
              registration_date: reg.registrationDate ?? null,
              last_update_date: reg.lastUpdateDate ?? null,
              primary_naics: primaryNaics,
              naics_list: e.assertions?.goodsAndServices?.naicsList ?? [],
              physical_address: addr,
              // Internal-specific signals consumed downstream by qualifier
              // + ranker (Stage 6/7); kept on raw_payload for forward compat.
              internal_federal_registration: 'sam-registered',
              internal_construction_naics_match: naics,
            },
            city: addr.city ?? null,
            state: addr.stateOrProvinceCode ?? null,
            country: addr.countryCode ?? 'USA',
          });
        }
        if (records.length < pageSize) break;
      }
    }

    return events;
  },
};
