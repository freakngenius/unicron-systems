// services/source-onboarder/tools/run-test-fetch.ts
//
// Drives an Adapter against a candidate source. For Tier 1 default adapters,
// this just calls poll() and normalize() in sequence. For LLM-generated
// custom adapters (Phase 2 stretch goal), the code would be evaluated in a
// sandboxed worker — out of scope for the initial Tier 1 implementation per
// SPEC §14 open question on "sandboxed adapter execution".

import type { Adapter, AdapterRuntimeConfig, NormalizedEvent, ValidationResult } from '@/lib/adapters/types';

export interface RunTestFetchResult {
  ok: boolean;
  events: NormalizedEvent[];
  validations: ValidationResult[];
  errors: string[];
  rawCount: number;
  durationMs: number;
}

export async function runTestFetch(adapter: Adapter, config: AdapterRuntimeConfig, opts: { maxRecords?: number } = {}): Promise<RunTestFetchResult> {
  const startedAt = Date.now();
  const max = opts.maxRecords ?? 5;
  const errors: string[] = [];
  let raws: unknown[] = [];
  try {
    raws = (await adapter.poll(config)) as unknown[];
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { ok: false, events: [], validations: [], errors, rawCount: 0, durationMs: Date.now() - startedAt };
  }
  const sampled = raws.slice(0, max);
  const events: NormalizedEvent[] = [];
  const validations: ValidationResult[] = [];
  for (const r of sampled) {
    try {
      const event = adapter.normalize(r, config);
      events.push(event);
      const v = adapter.validate(event);
      validations.push(v);
      if (!v.ok) errors.push(...v.errors);
    } catch (e) {
      errors.push(`normalize failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const ok = errors.length === 0 && events.length > 0;
  return {
    ok,
    events,
    validations,
    errors,
    rawCount: raws.length,
    durationMs: Date.now() - startedAt,
  };
}
