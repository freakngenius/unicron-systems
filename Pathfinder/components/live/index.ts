// components/live/index.ts — barrel export for the liveness layer.
//
// Stream 3 imports from here. Names match the prototype 1:1 so the call
// sites in `app/page.tsx` / `components/Map.tsx` stay close to the
// reference implementation in `pathfinder-prototype/project/Pathfinder Hi-Fi.html`.

export { AgentStatusRow } from './AgentStatusRow';
export type { AgentStatusRowProps } from './AgentStatusRow';

export { AgentCell, deriveCellData } from './AgentCell';
export type { AgentCellData, AgentCellProps, DeriveCellExtras } from './AgentCell';

export { StatusPill } from './StatusPill';
export type { StatusPillProps, AgentStatus } from './StatusPill';

export { ModelRoutingStrip } from './ModelRoutingStrip';
export type { ModelRoutingStripProps } from './ModelRoutingStrip';

export { ActivityRail } from './ActivityRail';
export type { ActivityRailProps } from './ActivityRail';

export { LiveStat } from './LiveStat';
export type { LiveStatProps } from './LiveStat';

export { PulsingDot } from './PulsingDot';
export type { PulsingDotProps } from './PulsingDot';

export { LastIngestCounter } from './LastIngestCounter';
export type { LastIngestCounterProps } from './LastIngestCounter';

export { SonarPing } from './SonarPing';
export type { SonarPingProps } from './SonarPing';

export { CountUpScore } from './CountUpScore';
export type { CountUpScoreProps } from './CountUpScore';

export { Typewriter } from './Typewriter';
export type { TypewriterProps } from './Typewriter';

// Hooks — re-exported so consumers can import from a single barrel.
export {
  useAgentLog,
  useAgentRuns,
  useNewPins,
  useJustRanked,
  useLastIngest,
  useProjectInserts,
  useProjectScored,
  useStats,
  useModels,
  useEscalations,
  useHeaderHeight,
  setHeaderHeight,
  useRailHeight,
  setRailHeight,
  useLiveKeyframes,
  isFirstOpen,
  markSeen,
  MODEL_META,
  LOG_CAP,
  AGENTS,
  agentTint,
} from '@/lib/realtime';

export type {
  AgentRunMap,
  PfStats,
  StatsBundle,
  StatsBumps,
  StatsKey,
  ModelMeta,
  ModelsBundle,
} from '@/lib/realtime';

// Tints / palette helpers — also handy for Stream 3 to import here.
export { PF_TINTS, agentTintOnMap, hexAlpha } from '@/lib/agent-tints';
export type { AgentMeta } from '@/lib/agent-tints';
