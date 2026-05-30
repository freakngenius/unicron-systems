// lib/catalog/floor-stubs.tsx, Stream A Foundation + B/C/D wiring.
//
// Lazy stubs for the eleven registered modules. Stream A shipped invisible
// markers for all eleven. Streams B / C / D each replaced the loaders for
// the modules they own with real-component imports:
//   - Stream B: ranked-feed, filter-rail, kpi-strip, analytics-charts
//     (lib/catalog/modules/<id>/<Component>.tsx).
//   - Stream C: company-detail, outreach-composer, hubspot-sync,
//     warm-intro-panel (components/catalog/modules/<Component>.tsx).
//   - Stream D: pipeline-kanban, daily-digest (lib/catalog/modules/<id>/<Component>.tsx).
//   - Stream A unchanged: geo-map (no org enables it).
//
// The renderer hands props to whichever component the registry points at.
// Stream C's detail-surface components consume per-page data via the
// CompanyDetailContext provider mounted by CatalogDetailRenderer; calling
// the real loaders outside that provider will throw with a clear message.

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
  // Stream B Module 1: ranked-feed (dashboard.hero).
  'ranked-feed': () =>
    import('./modules/ranked-feed/RankedFeed').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  // Stream C wired. Imports the real detail.body module.
  'company-detail': () => import('@/components/catalog/modules/CompanyDetail'),
  // Stream C wired. Imports the real detail.outreach module.
  'outreach-composer': () => import('@/components/catalog/modules/OutreachComposer'),
  // Stream C wired. Imports the real detail.outreach action-affordance.
  'hubspot-sync': () => import('@/components/catalog/modules/HubspotSync'),
  // Stream D: pipeline-kanban (pipeline.board).
  'pipeline-kanban': () =>
    import('./modules/pipeline-kanban/PipelineKanbanModule').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  // Stream B Module 2: filter-rail (dashboard.filters), soft-gates per spec.
  'filter-rail': () =>
    import('./modules/filter-rail/FilterRail').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  // Stream C wired. Imports the real detail.relationships module.
  'warm-intro-panel': () => import('@/components/catalog/modules/WarmIntroPanel'),
  // Stream B Module 3: kpi-strip (dashboard.kpi), drops null-valued metrics.
  'kpi-strip': () =>
    import('./modules/kpi-strip/KpiStrip').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  // Stream B Module 4: analytics-charts (dashboard.charts), EmptyState on empty series.
  'analytics-charts': () =>
    import('./modules/analytics-charts/AnalyticsCharts').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  // Stream D: daily-digest (delivery.digest), non-visual catalog metadata
  // for the existing /api/cron/internal-digest route.
  'daily-digest': () =>
    import('./modules/daily-digest/DailyDigestModule').then((m) => ({
      default: m.default as unknown as React.ComponentType<ModuleComponentProps>,
    })),
  'geo-map': () => Promise.resolve({ default: GeoMapStub }),
} as const satisfies Record<ModuleId, () => Promise<{ default: React.ComponentType<ModuleComponentProps> }>>;
