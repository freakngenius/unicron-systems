// lib/adapters/index.ts — Adapter library barrel + registry.
//
// Public surface for the source-adapter library. Phase 2 Stream E owns
// writes; Pathfinder's existing inlined ingestor (USAspending + SAM.gov)
// remains untouched. The library will be migrated into during a future
// sprint per STREAM-README.

import type { Adapter, AdapterKind } from './types';
import { socrataAdapter } from './socrata';
import { restAdapter } from './rest';
import { rssAdapter } from './rss';
import { jsonDumpAdapter } from './json-dump';

export type { Adapter, AdapterKind, AdapterRuntimeConfig, AdapterSpec, NormalizedEvent, ValidationResult } from './types';
export { socrataAdapter } from './socrata';
export { restAdapter } from './rest';
export { rssAdapter, parseFeed } from './rss';
export { jsonDumpAdapter } from './json-dump';
export { validateNormalizedEvent } from './socrata';

export const ADAPTERS: Record<AdapterKind, Adapter> = {
  socrata: socrataAdapter,
  rest: restAdapter,
  rss: rssAdapter,
  'json-dump': jsonDumpAdapter,
  custom: socrataAdapter, // placeholder — generated 'custom' adapters are
                          // shipped via source_adapters.generated_code at
                          // runtime; this is a fallback for the registry.
};

export function getAdapter(kind: AdapterKind): Adapter {
  const a = ADAPTERS[kind];
  if (!a) throw new Error(`unknown adapter kind: ${kind}`);
  return a;
}
