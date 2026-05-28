// lib/orchestrator/run-source.ts
//
// Sprint Z1A — per-source orchestrator wrapper. Each source adapter
// returns SourceEvent[]; this module runs that call, applies the
// geofence policy, dedupes against pathfinder.projects via the existing
// UNIQUE(source, source_id) constraint, inserts new rows, and emits
// agent_log events keyed to the run.
//
// Spec: Specs/SPEC-zedcor-source-adapters.md §"Per-orchestrator behavior".

import { supabaseAdmin } from '@/lib/supabase';
import { SOURCE_ADAPTERS, type SourceEvent } from '@/lib/adapters/sources';
import {
  ZEDCOR_GEOFENCE_STATES,
  HOUSTON_HUB_SLUG,
  ZEDCOR_ORG_ID,
  MAX_CANDIDATES_PER_SOURCE,
} from './constants';

export interface RunSourceResult {
  source_slug: string;
  candidates_found: number;
  projects_inserted: number;
  inserted_ids: string[];
  dedup_skips: number;
  geofence_skips: number;
  errors: string[];
  status: 'success' | 'empty' | 'failed';
}

interface AgentLogInsert {
  agent_name: string;
  event_type: string;
  event_data: Record<string, unknown>;
  organization_id: string;
  runner: string;
  ts: string;
}

interface ProjectInsert {
  id: string;
  source: string;
  source_id: string;
  title: string;
  summary: string | null;
  posted_date: string | null;
  response_deadline: string | null;
  source_url: string | null;
  hub_id: string;
  agent_run_id: number;
  organization_id: string;
  project_stage: string;
  phase_confidence: number;
  score: number | null;
  rationale: string | null;
  raw_payload: Record<string, unknown>;
  verified: boolean;
}

async function logEvent(event: AgentLogInsert): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => { insert: (row: AgentLogInsert) => Promise<{ error: unknown }> };
  };
  await admin.from('agent_log').insert(event);
}

function projectIdFor(slug: string, sourceEventId: string): string {
  return `${slug}:${sourceEventId}`;
}

function inGeofence(state: string | null | undefined): boolean {
  if (!state) return true; // unknown state — admit (Notion writer flags it later)
  return ZEDCOR_GEOFENCE_STATES.has(state.toUpperCase());
}

/** Cap events to MAX_CANDIDATES_PER_SOURCE, keeping newest posted_date first. */
function capEvents(events: SourceEvent[]): { kept: SourceEvent[]; deferred: number } {
  if (events.length <= MAX_CANDIDATES_PER_SOURCE) return { kept: events, deferred: 0 };
  const sorted = [...events].sort((a, b) => {
    const at = a.posted_date ? new Date(a.posted_date).getTime() : 0;
    const bt = b.posted_date ? new Date(b.posted_date).getTime() : 0;
    return bt - at;
  });
  return {
    kept: sorted.slice(0, MAX_CANDIDATES_PER_SOURCE),
    deferred: events.length - MAX_CANDIDATES_PER_SOURCE,
  };
}

export async function runSource(slug: string, runId: number): Promise<RunSourceResult> {
  const adapter = SOURCE_ADAPTERS[slug];
  const result: RunSourceResult = {
    source_slug: slug,
    candidates_found: 0,
    projects_inserted: 0,
    inserted_ids: [],
    dedup_skips: 0,
    geofence_skips: 0,
    errors: [],
    status: 'success',
  };

  if (!adapter) {
    result.status = 'failed';
    result.errors.push(`adapter not registered in SOURCE_ADAPTERS: ${slug}`);
    await logEvent({
      agent_name: 'zedcor-orchestrator-manual',
      event_type: 'source_failed',
      event_data: { run_id: runId, source_slug: slug, reason: 'adapter_missing' },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
    });
    return result;
  }

  // Adapter.poll() — fetch + parse.
  let rawEvents: SourceEvent[] = [];
  try {
    rawEvents = await adapter.poll({
      organizationId: ZEDCOR_ORG_ID,
      organizationSlug: 'zedcor',
      // The architecture object is required by the Funder/Internal flow; for
      // Z1A we pass a minimal stub. Zedcor adapters do not read .architecture.
      architecture: { sources: [], scoring: { weights: {} } } as unknown as never,
      runId,
      hubId: HOUSTON_HUB_SLUG,
    });
  } catch (err) {
    result.status = 'failed';
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    await logEvent({
      agent_name: 'zedcor-orchestrator-manual',
      event_type: 'source_failed',
      event_data: { run_id: runId, source_slug: slug, reason: msg.slice(0, 500) },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
    });
    return result;
  }

  const { kept: events, deferred } = capEvents(rawEvents);
  result.candidates_found = events.length;
  if (deferred > 0) {
    await logEvent({
      agent_name: 'zedcor-orchestrator-manual',
      event_type: 'source_deferred',
      event_data: { run_id: runId, source_slug: slug, deferred_count: deferred },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
    });
  }

  if (events.length === 0) {
    result.status = 'empty';
    await logEvent({
      agent_name: 'zedcor-orchestrator-manual',
      event_type: 'source_empty',
      event_data: { run_id: runId, source_slug: slug },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
    });
    return result;
  }

  // Geofence + projects insert.
  const admin = supabaseAdmin();
  for (const ev of events) {
    const state = (ev.raw_payload?.state as string | null) ?? null;
    if (!inGeofence(state)) {
      result.geofence_skips += 1;
      continue;
    }
    await logEvent({
      agent_name: 'zedcor-orchestrator-manual',
      event_type: 'source_hit',
      event_data: { run_id: runId, source_slug: slug, source_event_id: ev.source_event_id },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
    });

    const projectId = projectIdFor(slug, ev.source_event_id);
    const row: ProjectInsert = {
      id: projectId,
      source: slug,
      source_id: ev.source_event_id,
      title: ev.title,
      summary: ev.summary,
      posted_date: ev.posted_date,
      response_deadline: (ev.raw_payload?.response_deadline as string | null) ?? null,
      source_url: (ev.raw_payload?.source_url as string | null) ?? null,
      hub_id: HOUSTON_HUB_SLUG,
      agent_run_id: runId,
      organization_id: ZEDCOR_ORG_ID,
      project_stage: 'unknown',
      phase_confidence: 0,
      score: null,
      rationale: null,
      raw_payload: ev.raw_payload,
      verified: false,
    };

    const insert = (admin as unknown as {
      from: (t: string) => {
        upsert: (
          row: ProjectInsert,
          opts: { onConflict: string; ignoreDuplicates: boolean },
        ) => { select: (cols: string) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }> };
      };
    }).from('projects').upsert(row, {
      onConflict: 'source,source_id',
      ignoreDuplicates: true,
    });
    const { data, error } = await insert.select('id');
    if (error) {
      result.errors.push(`insert ${projectId}: ${error.message}`);
      continue;
    }
    if (data && data.length > 0) {
      result.projects_inserted += 1;
      result.inserted_ids.push(data[0].id);
      await logEvent({
        agent_name: 'zedcor-orchestrator-manual',
        event_type: 'project_inserted',
        event_data: { run_id: runId, source_slug: slug, project_id: projectId },
        organization_id: ZEDCOR_ORG_ID,
        runner: 'manual',
        ts: new Date().toISOString(),
      });
    } else {
      result.dedup_skips += 1;
    }
  }

  return result;
}
