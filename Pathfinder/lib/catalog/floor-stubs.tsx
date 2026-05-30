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
  // Stream B Module 1: replaced floor stub with the real ranked-feed
  // component. The renderer awaits the dynamic import at module activation
  // time, matching the loader shape the other stubs preserve.
  'ranked-feed': () =>
    import('./modules/ranked-feed/RankedFeed').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  'company-detail': () => Promise.resolve({ default: CompanyDetailStub }),
  'outreach-composer': () => Promise.resolve({ default: OutreachComposerStub }),
  'hubspot-sync': () => Promise.resolve({ default: HubspotSyncStub }),
  // Stream D replaces this stub with the real pipeline-kanban module.
  // Async server component cast through the standard ModuleComponentProps surface.
  'pipeline-kanban': () =>
    import('./modules/pipeline-kanban/PipelineKanbanModule').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  // Stream B Module 2: replaced floor stub with the real filter-rail
  // component. Soft-gates per spec (drops a filter whose backing schema
  // field is absent for the org).
  'filter-rail': () =>
    import('./modules/filter-rail/FilterRail').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  'warm-intro-panel': () => Promise.resolve({ default: WarmIntroPanelStub }),
  'kpi-strip': () => Promise.resolve({ default: KpiStripStub }),
  'analytics-charts': () => Promise.resolve({ default: AnalyticsChartsStub }),
  // Stream D replaces the daily-digest stub with a non-visual module that
  // declares the catalog metadata; the actual delivery runs through the
  // /api/cron/internal-digest route (see lib/catalog/modules/daily-digest).
  'daily-digest': () =>
    import('./modules/daily-digest/DailyDigestModule').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  'geo-map': () => Promise.resolve({ default: GeoMapStub }),
} as const satisfies Record<ModuleId, () => Promise<{ default: React.ComponentType<ModuleComponentProps> }>>;
