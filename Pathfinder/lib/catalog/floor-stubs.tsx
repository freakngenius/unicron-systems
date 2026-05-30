// lib/catalog/floor-stubs.tsx, Stream A Foundation.
//
// Lazy stubs for the eleven registered modules. Stream A is plumbing-only,
// so every stub renders an invisible marker rather than UI. Surface streams
// B/C/D replace these with real components when they wire the renderer into
// /[slug]/page.tsx and /[slug]/leads/[projectId]/page.tsx.
//
// The renderer hands props to whichever component the registry points at.
// These stubs keep the runtime contract honest without changing any visible
// surface.

import * as React from 'react';
import type { ModuleComponentProps, ModuleId } from './types';

void React;

function makeStub(id: ModuleId): React.ComponentType<ModuleComponentProps> {
  function FloorStub(_props: ModuleComponentProps) {
    return (
      <span
        data-module-stub={id}
        data-module-render-mode="floor-stub"
        aria-hidden
        style={{ display: 'none' }}
      />
    );
  }
  FloorStub.displayName = `FloorStub(${id})`;
  return FloorStub;
}

export const RankedFeedStub = makeStub('ranked-feed');
export const CompanyDetailStub = makeStub('company-detail');
export const OutreachComposerStub = makeStub('outreach-composer');
export const HubspotSyncStub = makeStub('hubspot-sync');
export const PipelineKanbanStub = makeStub('pipeline-kanban');
export const FilterRailStub = makeStub('filter-rail');
export const WarmIntroPanelStub = makeStub('warm-intro-panel');
export const KpiStripStub = makeStub('kpi-strip');
export const AnalyticsChartsStub = makeStub('analytics-charts');
export const DailyDigestStub = makeStub('daily-digest');
export const GeoMapStub = makeStub('geo-map');

/**
 * Map every registered module id to a thunk that returns the stub component.
 * Each thunk is wrapped in Promise.resolve so the registry's component refs
 * have a uniform Promise-returning shape that surface streams can replace
 * with real `() => import('./real-component')` thunks.
 */
export const FLOOR_STUB_LOADERS = {
  'ranked-feed': () => Promise.resolve({ default: RankedFeedStub }),
  'company-detail': () => Promise.resolve({ default: CompanyDetailStub }),
  'outreach-composer': () => Promise.resolve({ default: OutreachComposerStub }),
  'hubspot-sync': () => Promise.resolve({ default: HubspotSyncStub }),
  'pipeline-kanban': () => Promise.resolve({ default: PipelineKanbanStub }),
  'filter-rail': () => Promise.resolve({ default: FilterRailStub }),
  'warm-intro-panel': () => Promise.resolve({ default: WarmIntroPanelStub }),
  'kpi-strip': () => Promise.resolve({ default: KpiStripStub }),
  'analytics-charts': () => Promise.resolve({ default: AnalyticsChartsStub }),
  'daily-digest': () => Promise.resolve({ default: DailyDigestStub }),
  'geo-map': () => Promise.resolve({ default: GeoMapStub }),
} as const satisfies Record<ModuleId, () => Promise<{ default: React.ComponentType<ModuleComponentProps> }>>;
