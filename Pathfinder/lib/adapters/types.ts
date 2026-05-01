// lib/adapters/types.ts — Phase 2 Stream E.
//
// Canonical types for the source-adapter library. Each adapter implements
// the Adapter<TRaw> interface and emits NormalizedEvent records that the
// downstream pipeline (qualifier → ranker → verifier → outreach) consumes.
//
// Spec reference: SPEC - Source Onboarder Agent.md §5 (canonical schema),
// §7 (adapter generation prompt — module signature).

export type AdapterKind = 'socrata' | 'rest' | 'rss' | 'json-dump' | 'custom';

export interface NormalizedEvent {
  source_event_id: string;          // stable per-source id
  timestamp: string;                // ISO 8601 UTC
  source_url: string;
  jurisdiction: string;             // 'federal' | 'CA' | 'TX-Travis' | etc.
  raw_text?: string;
  project_value?: number;
  project_type?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    lat?: number;
    lng?: number;
  };
  gc_name?: string;
  metadata: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// Configuration shape passed by data_sources.config jsonb to the adapter at
// runtime. Each adapter narrows this further.
export interface AdapterRuntimeConfig {
  endpoint: string;
  page_size?: number;
  api_key_env?: string;            // name of env var holding the API key, if any
  jurisdiction?: string;
  poll_lookback_seconds?: number;  // override default lookback window
  filters?: Record<string, unknown>;
  // Headers / params / body to layer onto the request.
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
}

// Spec for generating a new adapter — passed to generateAdapterCode.
export interface AdapterSpec {
  kind: AdapterKind;
  endpoint: string;
  sampleRecords: unknown[];        // 3+ raw samples
  schemaInferred?: Record<string, unknown>;
  authPattern?: 'none' | 'api_key_query' | 'api_key_header' | 'bearer';
  paginationPattern?: 'none' | 'page_offset' | 'cursor' | 'link_header';
  jurisdictionHint?: string;
}

export interface Adapter<TRaw = unknown> {
  kind: AdapterKind;
  poll(config: AdapterRuntimeConfig): Promise<TRaw[]>;
  normalize(raw: TRaw, config: AdapterRuntimeConfig): NormalizedEvent;
  validate(event: NormalizedEvent): ValidationResult;
}
