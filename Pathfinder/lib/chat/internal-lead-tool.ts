// lib/chat/internal-lead-tool.ts
//
// Stream H, data tool. Scoped Supabase queries over the Internal org's
// pathfinder.projects rows (and the pathfinder.deals join for the
// kanban-stage pivot). Every query filters on organization_id at the
// server, so the tool cannot leak rows from another org even if the LLM
// asks for them in its argument shape.
//
// Output shapes are JSON-safe and label-projected through the existing
// CompanyLeadView so the chat agent reasons over the same display labels
// the UI shows ("Federal awardee", not "federal-awardee").
//
// Plan: Pathfinder/docs/PLAN-stream-h-data-tool.md.

import { supabaseAdmin } from '@/lib/supabase';
import type { Project } from '@/lib/types';
import type { DealPipelineStage } from '@/lib/types';
import { DEAL_PIPELINE_STAGES } from '@/lib/types';
import {
  projectToCompanyLeadView,
  type CompanyLeadView,
} from '@/lib/agents/internal/companyLeadView';
import {
  extractInternalSignals,
  type InternalSignal,
} from '@/lib/catalog/internalSignals';
import {
  DEAL_TO_INTERNAL,
  INTERNAL_PIPELINE_STAGES,
  INTERNAL_TO_DEAL,
  type InternalPipelineStage,
} from '@/lib/catalog/modules/pipeline-kanban/internalStageMap';

export type FederalRegistrationFilter = 'sam-registered' | 'federal-awardee' | 'both' | 'none';
export type SalesMotionFilter = 'active-outbound' | 'hiring-bd' | 'inbound-only' | 'unknown';
export type GroupBy =
  | 'pipeline_stage'
  | 'service_category'
  | 'sales_motion'
  | 'federal_registration'
  | 'verified';

export interface LeadFilter {
  federal_registration?: FederalRegistrationFilter;
  sales_motion?: SalesMotionFilter;
  service_category?: string;
  pipeline_stage?: InternalPipelineStage;
  min_score?: number;
  max_score?: number;
  verified?: boolean;
}

export type LeadToolInput =
  | { op: 'list'; filter?: LeadFilter; order?: 'score_desc' | 'recent' | 'name'; limit?: number }
  | { op: 'get'; id: string }
  | { op: 'search'; name_contains: string; limit?: number }
  | { op: 'aggregate'; group_by: GroupBy; filter?: LeadFilter };

export interface LeadToolContext {
  orgId: string;
  orgSlug: string;
}

export interface LeadListResult {
  op: 'list';
  count: number;
  rows: CompanyLeadView[];
}

export interface LeadGetResult {
  op: 'get';
  found: boolean;
  view: CompanyLeadView | null;
  signals: InternalSignal[];
  pipeline_stage: InternalPipelineStage | null;
}

export interface LeadSearchResult {
  op: 'search';
  count: number;
  rows: CompanyLeadView[];
}

export interface LeadAggregateResult {
  op: 'aggregate';
  group_by: GroupBy;
  groups: Array<{ key: string; count: number }>;
}

export type LeadToolResult =
  | LeadListResult
  | LeadGetResult
  | LeadSearchResult
  | LeadAggregateResult
  | { op: 'error'; message: string };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(input: number | undefined): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(input)));
}

// The Supabase 2.45 typed builder loses its method set after each `.eq /
// .gte / .lte` step in strict mode, so we use a hand-typed shape that
// mirrors the chain methods we actually call. Cast at the entry point
// once. Matches the loose-cast pattern in `app/api/chat/route.ts` and
// `lib/deals.ts`.
type ProjectsQResult = { data: unknown[] | null; error: { message: string } | null };
interface ProjectsQ extends PromiseLike<ProjectsQResult> {
  eq: (col: string, val: unknown) => ProjectsQ;
  gte: (col: string, val: unknown) => ProjectsQ;
  lte: (col: string, val: unknown) => ProjectsQ;
  ilike: (col: string, pattern: string) => ProjectsQ;
  order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => ProjectsQ;
  limit: (n: number) => ProjectsQ;
}

function projectsTableQuery(orgId: string): ProjectsQ {
  const admin = supabaseAdmin();
  const q = (admin.from('projects') as unknown as { select: (cols: string) => ProjectsQ })
    .select('*')
    .eq('organization_id', orgId);
  return q;
}

function applyServerFilter(q: ProjectsQ, filter: LeadFilter | undefined): ProjectsQ {
  if (!filter) return q;
  let out = q;
  if (filter.verified !== undefined) out = out.eq('verified', filter.verified);
  if (filter.min_score !== undefined) out = out.gte('score', filter.min_score);
  if (filter.max_score !== undefined) out = out.lte('score', filter.max_score);
  return out;
}

function clientSideMatch(view: CompanyLeadView, filter: LeadFilter | undefined): boolean {
  if (!filter) return true;
  // Federal registration uses the raw enum slug stored on raw_payload, which
  // the projection translates to a human label. We compare on the projection
  // to keep this layer consistent with what the LLM sees in list/get rows.
  if (filter.federal_registration) {
    const want = filter.federal_registration;
    const got = view.federal_registration ?? '';
    const FED_LABELS: Record<FederalRegistrationFilter, string> = {
      'sam-registered': 'SAM registered',
      'federal-awardee': 'Federal awardee',
      both: 'SAM + awardee',
      none: 'None',
    };
    if (got !== FED_LABELS[want]) return false;
  }
  if (filter.sales_motion) {
    const SM_LABELS: Record<SalesMotionFilter, string> = {
      'active-outbound': 'Active outbound',
      'hiring-bd': 'Hiring BD',
      'inbound-only': 'Inbound only',
      unknown: 'Unknown',
    };
    if (view.sales_motion !== SM_LABELS[filter.sales_motion]) return false;
  }
  if (filter.service_category) {
    const target = filter.service_category.toLowerCase();
    if (!view.service_category || !view.service_category.toLowerCase().includes(target)) {
      return false;
    }
  }
  return true;
}

async function loadStageMap(orgId: string): Promise<Map<string, InternalPipelineStage>> {
  const admin = supabaseAdmin();
  type DealRow = { project_id: string; pipeline_stage: DealPipelineStage };
  const { data } = await admin
    .from('deals')
    .select('project_id, pipeline_stage, project:projects!project_id(organization_id)')
    .limit(5000);
  const out = new Map<string, InternalPipelineStage>();
  for (const r of (data ?? []) as Array<DealRow & { project: { organization_id: string } | null }>) {
    if (!r.project || r.project.organization_id !== orgId) continue;
    const internal = DEAL_TO_INTERNAL[r.pipeline_stage];
    if (internal) out.set(r.project_id, internal);
  }
  return out;
}

export async function runLeadTool(
  input: LeadToolInput,
  ctx: LeadToolContext,
): Promise<LeadToolResult> {
  if (!ctx.orgId) {
    return { op: 'error', message: 'org_id_required' };
  }

  switch (input.op) {
    case 'list': {
      const limit = clampLimit(input.limit);
      const order = input.order ?? 'score_desc';
      let q = applyServerFilter(projectsTableQuery(ctx.orgId), input.filter);
      // We over-fetch a small multiple to give the client-side filter room.
      const overFetch = Math.min(MAX_LIMIT * 2, limit * 3);
      switch (order) {
        case 'score_desc':
          q = q.order('score', { ascending: false, nullsFirst: false });
          break;
        case 'recent':
          q = q.order('posted_date', { ascending: false, nullsFirst: false });
          break;
        case 'name':
          q = q.order('title', { ascending: true });
          break;
      }
      q = q.limit(overFetch);
      const { data, error } = await q;
      if (error) return { op: 'error', message: error.message };
      let projected = ((data ?? []) as Project[]).map(projectToCompanyLeadView);

      if (input.filter?.pipeline_stage) {
        const stageMap = await loadStageMap(ctx.orgId);
        projected = projected.filter((v) => stageMap.get(v.id) === input.filter?.pipeline_stage);
      }

      projected = projected.filter((v) => clientSideMatch(v, input.filter));
      const rows = projected.slice(0, limit);
      return { op: 'list', count: rows.length, rows };
    }
    case 'get': {
      if (!input.id) return { op: 'error', message: 'id_required' };
      const admin = supabaseAdmin();
      const { data, error } = await admin
        .from('projects')
        .select('*')
        .eq('organization_id', ctx.orgId)
        .eq('id', input.id)
        .maybeSingle();
      if (error) return { op: 'error', message: error.message };
      if (!data) return { op: 'get', found: false, view: null, signals: [], pipeline_stage: null };
      const row = data as Project;
      const view = projectToCompanyLeadView(row);
      const signals = extractInternalSignals(view, (row.raw_payload as Record<string, unknown>) ?? null);
      const { data: dealRow } = await admin
        .from('deals')
        .select('pipeline_stage')
        .eq('project_id', input.id)
        .maybeSingle();
      const stage = dealRow
        ? DEAL_TO_INTERNAL[(dealRow as { pipeline_stage: DealPipelineStage }).pipeline_stage] ?? null
        : null;
      return { op: 'get', found: true, view, signals, pipeline_stage: stage };
    }
    case 'search': {
      const limit = clampLimit(input.limit);
      const term = (input.name_contains ?? '').trim();
      if (!term) return { op: 'search', count: 0, rows: [] };
      const admin = supabaseAdmin();
      const { data, error } = await admin
        .from('projects')
        .select('*')
        .eq('organization_id', ctx.orgId)
        .ilike('title', `%${term}%`)
        .limit(limit);
      if (error) return { op: 'error', message: error.message };
      const rows = ((data ?? []) as Project[]).map(projectToCompanyLeadView);
      return { op: 'search', count: rows.length, rows };
    }
    case 'aggregate': {
      let q = applyServerFilter(projectsTableQuery(ctx.orgId), input.filter);
      q = q.limit(MAX_LIMIT * 50);
      const { data, error } = await q;
      if (error) return { op: 'error', message: error.message };
      let projected = ((data ?? []) as Project[]).map(projectToCompanyLeadView);
      projected = projected.filter((v) => clientSideMatch(v, input.filter));

      if (input.group_by === 'pipeline_stage') {
        const stageMap = await loadStageMap(ctx.orgId);
        const counts = new Map<string, number>();
        for (const stage of INTERNAL_PIPELINE_STAGES) counts.set(stage, 0);
        for (const v of projected) {
          const stage = stageMap.get(v.id) ?? null;
          if (stage === null) continue;
          counts.set(stage, (counts.get(stage) ?? 0) + 1);
        }
        return {
          op: 'aggregate',
          group_by: 'pipeline_stage',
          groups: INTERNAL_PIPELINE_STAGES.map((k) => ({ key: k, count: counts.get(k) ?? 0 })),
        };
      }

      const groupKey = (v: CompanyLeadView): string => {
        switch (input.group_by) {
          case 'service_category':
            return v.service_category ?? '(unknown)';
          case 'sales_motion':
            return v.sales_motion ?? '(unknown)';
          case 'federal_registration':
            return v.federal_registration ?? '(unknown)';
          case 'verified':
            return v.verified === null ? '(unknown)' : v.verified ? 'verified' : 'unverified';
          default:
            return '(unknown)';
        }
      };
      const counts = new Map<string, number>();
      for (const v of projected) {
        const k = groupKey(v);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const groups = Array.from(counts.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);
      return { op: 'aggregate', group_by: input.group_by, groups };
    }
  }
}

// JSON schema for the Anthropic tool_use registration. Kept close to the
// types above so a future arg gets exposed to the model in one edit.
export function leadToolJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      op: {
        type: 'string',
        enum: ['list', 'get', 'search', 'aggregate'],
        description: 'Which operation to run against the Internal org dataset.',
      },
      id: {
        type: 'string',
        description: 'Required for op=get. The project id (e.g. "sam:THALLE").',
      },
      name_contains: {
        type: 'string',
        description: 'Required for op=search. Case insensitive substring of the company name.',
      },
      group_by: {
        type: 'string',
        enum: ['pipeline_stage', 'service_category', 'sales_motion', 'federal_registration', 'verified'],
        description: 'Required for op=aggregate. The field to group counts by.',
      },
      order: {
        type: 'string',
        enum: ['score_desc', 'recent', 'name'],
        description: 'Optional for op=list. Defaults to score_desc.',
      },
      limit: {
        type: 'number',
        description: 'Optional. Capped at 100. Defaults to 20.',
      },
      filter: {
        type: 'object',
        properties: {
          federal_registration: {
            type: 'string',
            enum: ['sam-registered', 'federal-awardee', 'both', 'none'],
          },
          sales_motion: {
            type: 'string',
            enum: ['active-outbound', 'hiring-bd', 'inbound-only', 'unknown'],
          },
          service_category: { type: 'string' },
          pipeline_stage: {
            type: 'string',
            enum: [...INTERNAL_PIPELINE_STAGES],
          },
          min_score: { type: 'number' },
          max_score: { type: 'number' },
          verified: { type: 'boolean' },
        },
      },
    },
    required: ['op'],
  };
}

// SPEC-Chat-Fixes.md defect 3: pull every CompanyLeadView a single tool
// call surfaced. The agent loop collects these across rounds (dedup by
// view.id) and emits them as a `referenced_leads` SSE event so the
// panel can render them as inline lead cards under the assistant prose.
export function extractReferencedLeads(r: LeadToolResult): CompanyLeadView[] {
  if (r.op === 'list' || r.op === 'search') return r.rows;
  if (r.op === 'get') return r.view ? [r.view] : [];
  return [];
}

// Compact, LLM-friendly stringification of a tool result. The model gets
// the structured JSON via tool_result content, but a human-readable summary
// helps it ground the narrative without re-quoting the whole blob. Used
// for the SSE tool_done summary field.
export function summarizeToolResult(r: LeadToolResult): string {
  if (r.op === 'error') return `error: ${r.message}`;
  if (r.op === 'list') return `${r.count} row${r.count === 1 ? '' : 's'} listed`;
  if (r.op === 'search') return `${r.count} match${r.count === 1 ? '' : 'es'} for search`;
  if (r.op === 'get')
    return r.found ? `1 company: ${r.view?.company_name ?? '?'}` : 'no match';
  if (r.op === 'aggregate') {
    const top = r.groups.slice(0, 3).map((g) => `${g.key}=${g.count}`).join(', ');
    return `${r.groups.length} groups: ${top}${r.groups.length > 3 ? ', ...' : ''}`;
  }
  return '';
}

// Re-export the stage list so other modules don't import internalStageMap
// just for the enum.
export const ALL_INTERNAL_PIPELINE_STAGES = INTERNAL_PIPELINE_STAGES;
export const ALL_DEAL_PIPELINE_STAGES = DEAL_PIPELINE_STAGES;
export { INTERNAL_TO_DEAL };
