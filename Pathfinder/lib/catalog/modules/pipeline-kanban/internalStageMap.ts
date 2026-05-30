// lib/catalog/modules/pipeline-kanban/internalStageMap.ts, Stream D.
//
// Internal organization (#4) pipeline stages are declared in
// architecture.pipeline.stages as a seven-entry list of kebab-case ids
// (new-outreach-ready, contacted, in-conversation, demo-scheduled,
// proposal, won, lost). The shared deals table stores `pipeline_stage`
// as the existing DealPipelineStage enum (NEW, CONTACTED, REPLIED,
// MEETING, PROPOSAL, WON, LOST), shared with Zedcor.
//
// Stream D maps 1:1 between the two so the pipeline-kanban module can
// render Internal-labelled columns while persisting through the existing
// /api/deals/[id]/stage endpoint without any backend or schema change.

import type { DealPipelineStage } from '@/lib/types';

export type InternalPipelineStage =
  | 'new-outreach-ready'
  | 'contacted'
  | 'in-conversation'
  | 'demo-scheduled'
  | 'proposal'
  | 'won'
  | 'lost';

export const INTERNAL_PIPELINE_STAGES: readonly InternalPipelineStage[] = [
  'new-outreach-ready',
  'contacted',
  'in-conversation',
  'demo-scheduled',
  'proposal',
  'won',
  'lost',
] as const;

export const INTERNAL_TO_DEAL: Record<InternalPipelineStage, DealPipelineStage> = {
  'new-outreach-ready': 'NEW',
  contacted: 'CONTACTED',
  'in-conversation': 'REPLIED',
  'demo-scheduled': 'MEETING',
  proposal: 'PROPOSAL',
  won: 'WON',
  lost: 'LOST',
};

export const DEAL_TO_INTERNAL: Record<DealPipelineStage, InternalPipelineStage> = {
  NEW: 'new-outreach-ready',
  CONTACTED: 'contacted',
  REPLIED: 'in-conversation',
  MEETING: 'demo-scheduled',
  PROPOSAL: 'proposal',
  WON: 'won',
  LOST: 'lost',
};

export function isInternalPipelineStage(value: unknown): value is InternalPipelineStage {
  return typeof value === 'string' && (INTERNAL_PIPELINE_STAGES as readonly string[]).includes(value);
}
