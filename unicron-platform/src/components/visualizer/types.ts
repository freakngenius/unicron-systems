import type { SystemConfig, AgentDef, DataSource, AgentLayer } from '../../context/SystemContext';

export type Shape = 'hexagon' | 'diamond' | 'octagon';

export type RoleSpec = {
  /** The configured agent's id (1:1 with AgentDef.id). */
  agentId: string;
  layer: AgentLayer;
  role: string;
  color: string;
  shape: Shape;
  dwellMs: number;
  passRate: number;
};

export type NodeState = 'spawning' | 'idle' | 'processing' | 'engaged' | 'cooling' | 'despawning';

export type SimNode = {
  id: number;
  agentId: string;
  layer: AgentLayer;
  role: string;
  color: string;
  shape: Shape;
  angle: number;
  /** Logical position on its ring. */
  x: number;
  y: number;
  /** Render position (lerps during birth/despawn). */
  drawX: number;
  drawY: number;
  state: NodeState;
  stateStartMs: number;
  dwellMs: number;
  passRate: number;
  willPass: boolean;
  incomingTracerId?: number;
  operationId?: number;
  noiseSeed: number;
  birthScale: number;
  scaleBoost: number;
  desat: number;
  alphaMul: number;
  coolingStartIntensity?: number;
  _dead: boolean;
};

export type Tracer = {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startMs: number;
  travelMs: number;
  targetNodeId: number;
  /** -1 means going to center. */
  layer: AgentLayer | 5;
  role: string;
  color: string;
  history: { x: number; y: number; ms: number }[];
  operationId: number;
};

export type IntakeOffice = {
  angle: number;
  x: number;
  y: number;
};

export type HudSnapshot = {
  signalsProcessed: number;
  signalsRejected: number;
  decisionsMade: number;
  valueSurfaced: number;
  reportsDelivered: number;
  activeNodes: number;
  costPerReport: number;
};

export type Operation = {
  id: number;
  state: 'in_progress' | 'completed' | 'rejected';
  startMs: number;
  completionMs: number;
  chain: { x: number; y: number; layer: AgentLayer | 1 | 5; nodeId: number; role: string | null }[];
  sourceRole: string;
  inputTitle: string;
};

export type VisualizerEvent =
  | { kind: 'report-delivered'; valueSurfaced: number; reports: number }
  | { kind: 'node-clicked'; agentId: string }
  | { kind: 'hud'; hud: HudSnapshot };

/** Re-export for convenience. */
export type { SystemConfig, AgentDef, DataSource };
