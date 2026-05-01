// lib/agents/index.ts — Phase 2 Stream A Gate A2.
//
// Public agent surface for in-repo research / deterministic agents.
// Stream D (Architect) and other consumers import from this barrel; the
// individual files preserve the implementation freedom to refactor.
//
// CompetitiveIntel is intentionally NOT exported — per MEMORY/decisions.md
// D7 it remains a Computer Space agent with no in-repo runtime through
// Phase 2 Stream A. If/when Phase 3 cuts it over, add the export here.

export {
  enrichProject,
  isUsableBrief,
  ENRICHER_MODEL,
  type EnricherInput,
  type EnricherOutput,
} from './enricher';

export {
  findAdjacent,
  parseAdjacencyResponse,
  ADJACENCY_MODEL,
  type AdjacencyInput,
  type AdjacencyOutput,
  type AdjacentCandidate,
} from './adjacency';

export {
  mapGeo,
  haversineMiles,
  nearestBranch,
  findWarmIntro,
  type GeoMetadata,
} from './geo';
