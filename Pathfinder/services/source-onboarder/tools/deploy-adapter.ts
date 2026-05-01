// services/source-onboarder/tools/deploy-adapter.ts
//
// Persists adapter + data_source rows. "Deploy" in Phase 2 means write to
// pathfinder.source_adapters and pathfinder.data_sources; the Pathfinder
// ingestor cron + (Phase 2 Stream A) the new agent dispatcher will pick up
// new sources from there.
//
// Hot-loading generated adapter code at runtime is deferred per SPEC §14
// open question — Phase 2 default is "Tier 1 sources use shared lib/adapters
// modules; custom code stays in the row but is not yet evaluated."

import { supabaseAdmin } from '@/lib/supabase';
import type { AdapterKind, AdapterRuntimeConfig } from '@/lib/adapters/types';

export interface DeployAdapterArgs {
  kind: AdapterKind;
  name: string;                       // 'socrata-default' | 'travis-county-deeds'
  generatedCode?: string | null;
  schemaInferred?: Record<string, unknown>;
  sampleRecords?: unknown[];
  generatedBySessionId?: string | null;
}

export interface DeployDataSourceArgs {
  name: string;
  description?: string | null;
  candidateUrl: string;
  adapterKind: AdapterKind;
  adapterId: string;
  jurisdiction?: string | null;
  pollFrequencySeconds?: number;
  config: AdapterRuntimeConfig;
  metadata?: Record<string, unknown>;
  createdByUserEmail?: string | null;
}

export async function deployAdapter(args: DeployAdapterArgs): Promise<{ id: string; created: boolean }> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            limit: (n: number) => Promise<{ data: { id: string }[] | null; error: unknown }>;
          };
        };
      };
      insert: (rows: Record<string, unknown>[]) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  // Idempotent: if an adapter with same (kind, name) exists, return it.
  const existing = await sb
    .from('source_adapters')
    .select('id')
    .eq('kind', args.kind)
    .eq('name', args.name)
    .limit(1);
  if (existing.data && existing.data.length > 0) {
    return { id: existing.data[0].id, created: false };
  }
  const insertResult = await sb
    .from('source_adapters')
    .insert([
      {
        kind: args.kind,
        name: args.name,
        version: '0.1.0',
        generated_code: args.generatedCode ?? null,
        generated_by_session_id: args.generatedBySessionId ?? null,
        schema_inferred: args.schemaInferred ?? null,
        sample_records: args.sampleRecords ?? null,
      },
    ])
    .select('id')
    .single();
  if (insertResult.error || !insertResult.data) {
    throw new Error(`source_adapters insert failed: ${insertResult.error?.message ?? 'no row returned'}`);
  }
  return { id: insertResult.data.id, created: true };
}

export async function deployDataSource(args: DeployDataSourceArgs): Promise<{ id: string }> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>[]) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const insertResult = await sb
    .from('data_sources')
    .insert([
      {
        name: args.name,
        description: args.description ?? null,
        candidate_url: args.candidateUrl,
        adapter_kind: args.adapterKind,
        adapter_id: args.adapterId,
        jurisdiction: args.jurisdiction ?? null,
        poll_frequency_seconds: args.pollFrequencySeconds ?? 1800,
        status: 'live',
        config: args.config,
        metadata: args.metadata ?? {},
        created_by_user_email: args.createdByUserEmail ?? null,
      },
    ])
    .select('id')
    .single();
  if (insertResult.error || !insertResult.data) {
    throw new Error(`data_sources insert failed: ${insertResult.error?.message ?? 'no row returned'}`);
  }
  return { id: insertResult.data.id };
}
