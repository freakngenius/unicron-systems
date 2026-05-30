// lib/deals.ts — server-side deals library (Stream B Gate B1).
//
// Single source of truth for deal-row CRUD + activity logging. Used by
// /api/deals (read), /api/deals/[id]/stage (write), /api/deals/seed
// (admin-only auto-create from verified projects). Stream B Gate B2
// (send-from-Pathfinder) and B3 (reply-detection + timeline) extend the
// activity helpers; the writers below are the seed.
//
// All writes use supabaseAdmin() — RLS rejects anon writes per migration
// 0050_deals.sql. Same pattern as lib/llm/recorder.ts (G2 fix).

import { supabase, supabaseAdmin } from '@/lib/supabase';
import type {
  Deal,
  DealActivity,
  DealActivityType,
  DealPipelineStage,
  DealWithProject,
} from '@/lib/types';
import { DEAL_PIPELINE_STAGES } from '@/lib/types';

export function isDealPipelineStage(value: unknown): value is DealPipelineStage {
  return typeof value === 'string' && (DEAL_PIPELINE_STAGES as readonly string[]).includes(value);
}

export interface ListDealsOptions {
  stage?: DealPipelineStage | null;
  ownerEmail?: string | null;
  limit?: number;
}

const PROJECT_HYDRATE_FIELDS =
  'id,title,project_value,score,verified,nearest_branch_id,distance_miles,source,project_stage';

// Read deals joined with project metadata. Anon-friendly — RLS allows
// SELECT for anon + authenticated. Returns deals across all stages by
// default; the Kanban page consumes this and groups client-side.
export async function listDealsWithProjects(
  options: ListDealsOptions = {},
): Promise<DealWithProject[]> {
  let q = supabase
    .from('deals')
    .select(`*, project:projects!project_id(${PROJECT_HYDRATE_FIELDS})`)
    .order('updated_at', { ascending: false })
    .limit(options.limit ?? 500);

  if (options.stage) q = q.eq('pipeline_stage', options.stage);
  if (options.ownerEmail) q = q.eq('owner_email', options.ownerEmail);

  const { data, error } = await q;
  if (error) {
    throw new Error(`listDealsWithProjects: ${error.message}`);
  }

  // The PostgREST embedded select returns project as either an object
  // (one-to-one) or null. Normalize to DealWithProject shape — drop rows
  // whose project is missing (project deleted but deal cascade should have
  // removed it; this is defensive).
  return (data ?? [])
    .map((row) => {
      const project = (row as { project?: DealWithProject['project'] | null }).project ?? null;
      if (!project || !project.id) return null;
      return { ...(row as Deal), project } as DealWithProject;
    })
    .filter((row): row is DealWithProject => row !== null);
}

export interface CreateDealInput {
  projectId: string;
  ownerEmail?: string | null;
  pipelineStage?: DealPipelineStage;
  valueUsd?: number | null;
  notes?: string | null;
}

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  const admin = supabaseAdmin();
  type DealsInsert = ReturnType<typeof admin.from> extends { insert: (row: infer R) => unknown }
    ? R
    : never;

  const insertRow: Record<string, unknown> = {
    project_id: input.projectId,
    owner_email: input.ownerEmail ?? null,
    pipeline_stage: input.pipelineStage ?? 'NEW',
    value_usd: input.valueUsd ?? null,
    notes: input.notes ?? null,
  };

  // The supabase-js typed `insert` rejects shapes under PostgrestVersion: 12;
  // cast to a loose-typed shape per MEMORY/conventions.md (same pattern as
  // lib/briefing.ts, lib/llm/recorder.ts).
  const { data, error } = await (admin.from('deals') as unknown as {
    insert: (row: DealsInsert) => {
      select: () => { single: () => Promise<{ data: Deal | null; error: { message: string } | null }> };
    };
  })
    .insert(insertRow as DealsInsert)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`createDeal: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}

export interface RecordActivityInput {
  dealId: string;
  activityType: DealActivityType;
  fromStage?: DealPipelineStage | null;
  toStage?: DealPipelineStage | null;
  payload?: Record<string, unknown>;
  actorEmail?: string | null;
}

export async function recordDealActivity(
  input: RecordActivityInput,
): Promise<DealActivity> {
  const admin = supabaseAdmin();
  const insertRow: Record<string, unknown> = {
    deal_id: input.dealId,
    activity_type: input.activityType,
    from_stage: input.fromStage ?? null,
    to_stage: input.toStage ?? null,
    payload: input.payload ?? {},
    actor_email: input.actorEmail ?? null,
  };

  const { data, error } = await (admin.from('deal_activities') as unknown as {
    insert: (row: Record<string, unknown>) => {
      select: () => { single: () => Promise<{ data: DealActivity | null; error: { message: string } | null }> };
    };
  })
    .insert(insertRow)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`recordDealActivity: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}

export interface MoveDealStageInput {
  dealId: string;
  toStage: DealPipelineStage;
  actorEmail?: string | null;
  payload?: Record<string, unknown>;
  // Stream G: when the inbound caller is the Notion webhook receiver
  // (a Notion-side stage edit), set this to 'notion' so the on-update
  // hook does NOT propagate the same stage back to Notion. Without this
  // guard the two systems would ping-pong on every edit.
  notionSyncSource?: 'app' | 'notion';
}

export interface MoveDealStageResult {
  deal: Deal;
  activity: DealActivity;
  noop: boolean;
}

// Update a deal's pipeline_stage and write an audit row. Idempotent on
// from === to (returns noop=true with no activity row written, no SQL
// update).
export async function moveDealStage(input: MoveDealStageInput): Promise<MoveDealStageResult> {
  const admin = supabaseAdmin();

  const { data: existingRaw, error: readError } = await admin
    .from('deals')
    .select('*')
    .eq('id', input.dealId)
    .maybeSingle();

  if (readError) {
    throw new Error(`moveDealStage: read ${readError.message}`);
  }
  if (!existingRaw) {
    throw new Error(`moveDealStage: deal ${input.dealId} not found`);
  }

  const existing = existingRaw as Deal;
  const fromStage = existing.pipeline_stage;
  if (fromStage === input.toStage) {
    // No-op — caller may be replaying a drag-end event. Return existing
    // row + a synthetic activity placeholder (matches MoveDealStageResult
    // shape without writing a row).
    return {
      deal: existing,
      activity: {
        id: '00000000-0000-0000-0000-000000000000',
        deal_id: input.dealId,
        activity_type: 'stage_change',
        from_stage: fromStage,
        to_stage: input.toStage,
        payload: { noop: true },
        actor_email: input.actorEmail ?? null,
        created_at: new Date().toISOString(),
      },
      noop: true,
    };
  }

  const { data: updated, error: updateError } = await (admin.from('deals') as unknown as {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        select: () => { single: () => Promise<{ data: Deal | null; error: { message: string } | null }> };
      };
    };
  })
    .update({ pipeline_stage: input.toStage })
    .eq('id', input.dealId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(`moveDealStage: update ${updateError?.message ?? 'no row'}`);
  }

  const activity = await recordDealActivity({
    dealId: input.dealId,
    activityType: 'stage_change',
    fromStage,
    toStage: input.toStage,
    actorEmail: input.actorEmail ?? null,
    payload: input.payload ?? {},
  });

  // Stream G: propagate app-side moves to the Internal Pipeline Notion
  // database. Skip when the source is Notion to break the loop. Dynamic
  // import keeps the Notion client out of code paths that never touch
  // sync (other orgs, server-only callers without NOTION_API_KEY).
  if (input.notionSyncSource !== 'notion' && process.env.NOTION_DB_INTERNAL_PIPELINE) {
    try {
      const { updateNotionStage } = await import('@/lib/notion/internal-pipeline');
      const result = await updateNotionStage(input.dealId, input.toStage);
      if (!result.updated && result.reason && result.reason !== 'no mapping for deal') {
        // eslint-disable-next-line no-console
        console.warn(`[moveDealStage] notion propagate skipped: ${result.reason}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[moveDealStage] notion propagate failed for ${input.dealId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { deal: updated, activity, noop: false };
}
