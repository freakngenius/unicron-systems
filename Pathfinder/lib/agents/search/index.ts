// lib/agents/search/index.ts — public barrel for ICP Saved Search S2.
//
// S1 (orchestration job), S3 (UI), S4 (progress) import from here.

export * from './types';

export {
  interpretIcp,
  type InterpretDeps,
} from './interpret';

export {
  resolveGeoRadius,
  parseRegionString,
  type GeoDeps,
} from './geo';

export {
  planSources,
  type PlanDeps,
  type PlanSourcesInput,
} from './plan';

export {
  runSearchPlan,
  runIngestForSearch,
  loadSavedSearchRow,
  doPhaseInterpret,
  doPhaseGeo,
  doPhaseSources,
  doPhaseWire,
  doPhaseScrape,
  doPhaseScore,
  type RunSearchPlanDeps,
  type RunSearchPlanResult,
  type RunIngestDeps,
  type RunIngestResult,
  type WireOutcome,
  type InterpretPhaseDeps,
  type GeoPhaseDeps,
  type SourcesPhaseDeps,
  type WirePhaseDeps,
  type ScrapePhaseDeps,
  type ScorePhaseDeps,
} from './run';
