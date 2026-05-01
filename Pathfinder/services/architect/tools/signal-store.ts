// services/architect/tools/signal-store.ts — Phase 2 Stream D Gate D3.
// Spec: SPEC - Architect Agent.md §5 (queryRecentSignals data source).
//
// Pathfinder reality: there is no `signals` table per the generic spec
// data model. The closest analogue is `pathfinder.projects` with
// `verified=true` and a non-null score — these are the qualified leads
// the Architect's discovery session should reason over.
//
// Also exposes the set of currently-watched source types so the
// Architect can identify "referenced but not watched" candidates.

import { SOURCE_CATALOG } from './source-catalog';

export interface QualifiedSignal {
  project_id: string;
  source: string;                      // ProjectSource string
  title: string;
  summary: string | null;
  raw_payload: Record<string, unknown> | null;
  // Geography fields — Pathfinder stores lat/lon + nearest_branch_id.
  // The Architect mines free-text from title/summary/payload for
  // jurisdiction mentions because nearest_branch is the customer's
  // coverage map, not the lead's true jurisdiction.
  lat: number | null;
  lon: number | null;
  score: number | null;
  verified: boolean | null;
  ingested_at: string;
}

export interface SignalStore {
  loadQualifiedSignals(verticalId: string, sinceIso: string): Promise<QualifiedSignal[]>;
  // Returns the source types currently being watched by Pathfinder
  // (used to filter out "already watched" candidates from discovery).
  loadCurrentlyWatchedSourceTypes(verticalId: string): Promise<string[]>;
}

class SupabaseSignalStore implements SignalStore {
  async loadQualifiedSignals(verticalId: string, sinceIso: string): Promise<QualifiedSignal[]> {
    void verticalId;
    const { supabaseAdmin } = await import('@/lib/supabase');
    type AnyClient = {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, v: unknown) => {
            gte: (col: string, v: string) => {
              order: (col: string, opts?: { ascending?: boolean }) => {
                limit: (n: number) => Promise<{
                  data: Record<string, unknown>[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
    const sb = supabaseAdmin() as unknown as AnyClient;
    try {
      const { data, error } = await sb
        .from('projects')
        .select('id, source, title, summary, raw_payload, lat, lon, score, verified, ingested_at')
        .eq('verified', true)
        .gte('ingested_at', sinceIso)
        .order('ingested_at', { ascending: false })
        .limit(500);
      if (error || !data) return [];
      return data.map((row) => ({
        project_id: String(row.id),
        source: String(row.source ?? ''),
        title: String(row.title ?? ''),
        summary: (row.summary as string | null) ?? null,
        raw_payload: (row.raw_payload as Record<string, unknown> | null) ?? null,
        lat: (row.lat as number | null) ?? null,
        lon: (row.lon as number | null) ?? null,
        score: (row.score as number | null) ?? null,
        verified: (row.verified as boolean | null) ?? null,
        ingested_at: String(row.ingested_at),
      }));
    } catch (err) {
      console.warn('[architect.signals] projects read failed:', err);
      return [];
    }
  }

  async loadCurrentlyWatchedSourceTypes(verticalId: string): Promise<string[]> {
    void verticalId;
    // Pathfinder watches usaspending + sam.gov (live ingestor) + harris-county
    // permits + news (Sonar). Future Source Onboarder writes will live in
    // a `data_sources` table; until then the set is hardcoded to match the
    // ingestor's actual code paths.
    return ['usaspending', 'sam.gov', 'harris-county-permits', 'news-google'];
  }
}

let _store: SignalStore | null = null;
export function getSignalStore(): SignalStore {
  if (_store) return _store;
  _store = new SupabaseSignalStore();
  return _store;
}

export function setSignalStoreForTesting(store: SignalStore | null): void {
  _store = store;
}

// ---- Open-data portal hint catalog (used by searchOpenDataPortals) ------
//
// Static lookup — for production the Source Onboarder service (Stream E)
// owns a richer catalog at services/source-onboarder/. Until that lands
// the discovery session uses this stopgap.

export interface PortalHint {
  jurisdiction_pattern: RegExp;
  url: string;
  type: string;
  name: string;
  tier: 'tier_1' | 'tier_2' | 'tier_3';
}

const PORTAL_HINTS: PortalHint[] = [
  {
    jurisdiction_pattern: /^(tx-?travis|austin|austin\s*tx)$/i,
    url: 'https://data.austintexas.gov/dataset/Permits-Issued/3syk-w9eu',
    type: 'austin-tx-permits',
    name: 'City of Austin building permits (Socrata)',
    tier: 'tier_1',
  },
  {
    jurisdiction_pattern: /^(tx-?harris|harris(\s*county)?)$/i,
    url: 'https://www.eng.hctx.net/Permits',
    type: 'harris-county-permits',
    name: 'Harris County (TX) permits',
    tier: 'tier_1',
  },
  {
    jurisdiction_pattern: /^(ca-?la|los\s*angeles)$/i,
    url: 'https://data.lacounty.gov',
    type: 'la-county-permits',
    name: 'Los Angeles County open-data portal',
    tier: 'tier_2',
  },
  {
    jurisdiction_pattern: /^(tx-?dallas|dallas)$/i,
    url: 'https://www.dallasopendata.com',
    type: 'dallas-tx-permits',
    name: 'City of Dallas open-data portal',
    tier: 'tier_2',
  },
  {
    jurisdiction_pattern: /^(tx-?bexar|san\s*antonio)$/i,
    url: 'https://data.sanantonio.gov',
    type: 'san-antonio-tx-permits',
    name: 'San Antonio open-data portal',
    tier: 'tier_2',
  },
  {
    jurisdiction_pattern: /^(fl-?miami(-?dade)?|miami(-dade)?)$/i,
    url: 'https://opendata.miamidade.gov',
    type: 'miami-dade-permits',
    name: 'Miami-Dade County open-data portal',
    tier: 'tier_2',
  },
  {
    jurisdiction_pattern: /^(fema)$/i,
    url: 'https://www.fema.gov/api/open',
    type: 'fema-disaster-declarations',
    name: 'FEMA disaster declarations API',
    tier: 'tier_1',
  },
  {
    jurisdiction_pattern: /^(sec-?edgar|edgar)$/i,
    url: 'https://data.sec.gov',
    type: 'sec-edgar',
    name: 'SEC EDGAR filings API',
    tier: 'tier_1',
  },
];

export function searchPortals(jurisdiction: string): PortalHint[] {
  const q = jurisdiction.trim();
  return PORTAL_HINTS.filter((p) => p.jurisdiction_pattern.test(q));
}

// Re-export catalog presence check for the discovery tool.
export function isKnownSourceType(type: string): boolean {
  return SOURCE_CATALOG.some((s) => s.type === type);
}
