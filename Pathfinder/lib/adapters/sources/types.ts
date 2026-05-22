// lib/adapters/sources/types.ts
//
// Funder onboarding Stage 3. New id-keyed source-adapter contract used by
// the org-aware ingestor (lib/inngest/functions/ingest-org-requested.ts).
//
// Why a parallel contract instead of reusing lib/adapters/types.ts
// (the kind-keyed ADAPTERS registry)? The existing kind-keyed registry
// (socrata/rest/rss/json-dump/custom) is consumed by the Source Onboarder
// flow which generates per-source adapter *code* from a kind + endpoint
// pair. Funder's adapters are hand-written per-source modules that pull
// from heterogeneous endpoints (ProPublica JSON, IRS BMF bulk, EA Forum
// RSS, etc.) and need adapter-specific normalize logic per source id,
// not per kind. Both registries coexist additively — the kind-keyed
// ADAPTERS continues to serve Source Onboarder; the id-keyed
// SOURCE_ADAPTERS serves the per-org dispatch subscriber.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.
// Plan: Pathfinder/docs/PLAN-funder-onboarding.md §3 Stage 3.

import type { OrgArchitecture } from '@/lib/types/architecture';

export type SourceAdapterType = 'registered' | 'tier-2-human-assist' | 'pending';

export interface SourceAdapter {
  /** Stable identifier matching architecture.sources[].id (e.g. "custom-propublica-nonprofit-explorer"). */
  id: string;
  /** Status reported back to the org row's architecture.sources[].type. */
  type: SourceAdapterType;
  /** Human-readable description shown in operator surfaces. */
  description: string;
  /**
   * Pull a window of raw events for the given org. Implementations should
   * be deterministic and idempotent at the source_event_id level so
   * cross-cycle de-dup at the projects table works cleanly.
   */
  poll(opts: SourcePollOptions): Promise<SourceEvent[]>;
}

export interface SourcePollOptions {
  organizationId: string;
  organizationSlug: string;
  architecture: OrgArchitecture;
  /** Window over which to fetch new records (seconds). Default 86400 = 24h. */
  lookbackSeconds?: number;
  /** Optional per-source overrides (passed by ingest-org-requested config). */
  config?: Record<string, unknown>;
  /** Optional test seam — when set, adapters that hit external APIs
   *  must use this fetch implementation. The subscriber injects the
   *  real `globalThis.fetch` in production. */
  fetch?: typeof fetch;
}

export interface SourceEvent {
  /** Stable per-source identifier; must dedupe cleanly across cycles. */
  source_event_id: string;
  /** Org name or signal title. Becomes pathfinder.projects.title. */
  title: string;
  /** Summary text; becomes pathfinder.projects.summary. */
  summary: string | null;
  /** ISO 8601 timestamp the upstream event was posted. */
  posted_date: string | null;
  /** Full raw upstream record, persisted for the qualifier + enricher. */
  raw_payload: Record<string, unknown>;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}
