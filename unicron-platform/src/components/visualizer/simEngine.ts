import gsap from 'gsap';
import type {
  AgentDef,
  IntakeOffice,
  Operation,
  RoleSpec,
  SimNode,
  SystemConfig,
  Tracer,
  VisualizerEvent,
} from './types';
import {
  PI2,
  LAYER_PALETTE,
  LAYER_SHAPE,
  angularDist,
  clamp,
  easeInOutCubic,
  easeOutCubic,
  hexToRgb,
  lerp,
  lerpRgb,
  makeNoise2D,
  pathByShape,
  pickWeighted,
  rand,
  randInt,
  rgbToCss,
  strokeShapePartial,
} from './shapes';

/**
 * Canvas-side mirrors of Atrium tokens. Canvas 2D fillStyle does not see CSS
 * custom properties, so we resolve once at module load via getComputedStyle
 * and fall back to the canonical baked-in hex values for SSR / tests.
 * If you change tokens.css, the resolved value updates automatically — the
 * fallbacks just need to track the canonical values.
 */
function resolveTokenValue(token: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v || fallback;
}

const CANVAS_BG = resolveTokenValue('--bg-ground', '#F6F7F9');

const CONFIG = {
  realSecondsPerDay: 180,
  intakeCount: 250,
  totalPermitsPerDay: 3900,
  multiSubmitterPct: 0.018,
  visibleTracerProbability: 1.0,
  layerRadiusFactor: { 1: 0.95, 2: 0.72, 3: 0.5, 4: 0.28 },
  centerRadius: 18,
  tracerTravelMsRange: [600, 1000] as [number, number],
  pulseDurationMs: 220,
  decayMs: 3000,
  costPerReportRange: [0.05, 0.09] as [number, number],
  valuePerReportRange: [25000, 250000] as [number, number],
  trailLength: 12,
  outerRingBreathing: true,
  /** Per-role instance counts so each ring has a populated feel. */
  initialInstancesByLayer: { 2: 7, 3: 5, 4: 3 },
  maxInstancesByLayer: { 2: 16, 3: 10, 4: 6 },
  /** Replication thresholds. */
  replicationCheckMs: 2000,
  replicationExcess: 2,
  replicationCooldownMs: 4000,
};

// Idle/highlight RGB constants for the dash + node passes. The baked-in
// fallbacks track the canonical Atrium token values:
//   --text-lo   #6B7280  (idle dash)
//   --text-hi   #0B1530  (hot dash, white-ish high-contrast)
//   --text-faint#4A5160  (idle node) — was #374151; aligned to faint-text.
const COLOR_DASH_IDLE = hexToRgb(resolveTokenValue('--text-lo', '#6B7280'));
const COLOR_DASH_HOT = hexToRgb(resolveTokenValue('--text-hi', '#0B1530'));
const COLOR_NODE_IDLE = hexToRgb(resolveTokenValue('--text-faint', '#4A5160'));

// Trail colors per-layer use the semantic palette: warn for layer 3,
// err for layer 4, text-hi for the special inner-ring case.
const _AMBER_RGB = hexToRgb(resolveTokenValue('--warn', '#C28A1F'));
const _RED_RGB = hexToRgb(resolveTokenValue('--err', '#E14B4B'));
const _WHITE_RGB = hexToRgb(resolveTokenValue('--text-hi', '#0B1530'));

function trailColorForLayer(layer: 2 | 3 | 4 | 5, color: string) {
  if (layer === 2) return hexToRgb(color);
  if (layer === 3) return _AMBER_RGB;
  if (layer === 4) return _RED_RGB;
  return _WHITE_RGB;
}

export type SimEngineOpts = {
  canvas: HTMLCanvasElement;
  config: SystemConfig;
  onEvent?: (e: VisualizerEvent) => void;
  density?: 'compact' | 'full';
  reducedMotion?: boolean;
};

export class SimEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  width = 0;
  height = 0;
  cx = 0;
  cy = 0;
  minDim = 0;
  layerR: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  density: 'compact' | 'full';
  reducedMotion: boolean;

  config: SystemConfig;
  /** Role spec table built from config.agents — indexed by agentId. */
  roles: Map<string, RoleSpec> = new Map();
  /** Source weights table built from config.dataSources — indexed by watcherRole. */
  sourceWeights: Record<string, number> = {};

  startReal = 0;
  lastFrame = 0;
  simTime = 0;
  permitAccum = 0;

  intakeOffices: IntakeOffice[] = [];
  multiSubmitterSet: Set<number> = new Set();
  activePulses: Map<number, { startMs: number }> = new Map();

  nodes: SimNode[] = [];
  nodesByLayer: Record<2 | 3 | 4, SimNode[]> = { 2: [], 3: [], 4: [] };
  nextNodeId = 1;

  tracers: Tracer[] = [];
  nextTracerId = 1;

  operations: Map<number, Operation> = new Map();
  nextOperationId = 1;

  signalsProcessed = 0;
  signalsRejected = 0;
  decisionsMade = 0;
  valueSurfaced = 0;
  reportsDelivered = 0;
  activeNodeCount = 0;
  costPerReport = 0.07;
  costPerReportTarget = 0.07;
  costPerReportLastShift = 0;

  centerPulseStart = -1;
  lastReplicationCheck = 0;
  sectorCooldown: Map<string, number> = new Map();

  paused = false;
  tabHidden = false;
  rafHandle: number | null = null;
  noise2D: (x: number, y: number) => number;
  onEvent?: (e: VisualizerEvent) => void;

  hoveredNodeId: number | null = null;
  clickHandler: (e: MouseEvent) => void;
  resizeHandler: () => void;
  resizeObserver: ResizeObserver | null = null;
  visibilityHandler: () => void;
  lastHudPush = 0;

  constructor(opts: SimEngineOpts) {
    this.canvas = opts.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d canvas context');
    this.ctx = ctx;
    this.config = opts.config;
    this.density = opts.density ?? 'full';
    this.reducedMotion = !!opts.reducedMotion;
    this.onEvent = opts.onEvent;
    this.noise2D = makeNoise2D();

    this.startReal = performance.now();
    this.lastFrame = this.startReal;
    this.lastReplicationCheck = this.startReal;

    this.resize();
    this.initOffices();
    this.rebuildRolesFromConfig();
    this.spawnInstancesForAllRoles(false);
    this.preroll(this.config.status === 'live' ? 4 : 0);

    this.clickHandler = this.handleClick.bind(this);
    this.resizeHandler = () => this.resize();
    this.visibilityHandler = () => this.handleVisibility();
    this.canvas.addEventListener('click', this.clickHandler);
    // Observe the canvas itself so we react to layout changes (initial flush,
    // grid stretch, sibling collapse) — not just window resize. Without this,
    // a canvas mounted before its parent has computed dimensions falls back to
    // the 300×150 default in resize() and is then CSS-stretched into an ellipse.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener('resize', this.resizeHandler);
    }
    document.addEventListener('visibilitychange', this.visibilityHandler);

    const tick = () => {
      this.rafHandle = requestAnimationFrame(tick);
      this.onTick();
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  /** Briefly highlight every instance of an agent (called when SAVE LIVE fires). */
  pulseAgent(agentId: string) {
    if (this.reducedMotion) return;
    for (const n of this.nodes) {
      if (n.agentId !== agentId || n._dead) continue;
      gsap.to(n, { scaleBoost: 1.32, duration: 0.22, ease: 'back.out(2.4)' });
      gsap.to(n, { scaleBoost: 1, duration: 0.5, ease: 'power2.out', delay: 0.22 });
    }
  }

  destroy() {
    if (this.rafHandle != null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
    this.canvas.removeEventListener('click', this.clickHandler);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener('resize', this.resizeHandler);
    }
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    gsap.killTweensOf(this.nodes);
    gsap.killTweensOf(this.tracers);
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v;
  }

  /**
   * Reconcile internal state against a fresh SystemConfig.
   * Adds instances for new agents, fades instances of removed agents,
   * and updates source weights without resetting the simulation.
   */
  updateConfig(next: SystemConfig) {
    const prevAgentIds = new Set(this.config.agents.map((a) => a.id));
    const nextAgentIds = new Set(next.agents.map((a) => a.id));
    this.config = next;

    this.rebuildRolesFromConfig();

    // Despawn instances of removed agents.
    const removedIds = new Set([...prevAgentIds].filter((id) => !nextAgentIds.has(id)));
    if (removedIds.size > 0) {
      for (const n of this.nodes) {
        if (removedIds.has(n.agentId)) this.despawnNode(n);
      }
    }

    // Mitose initial instances for newly added agents.
    for (const a of next.agents) {
      if (!prevAgentIds.has(a.id)) {
        this.spawnInstancesForAgent(a, true);
      } else {
        // Refresh dwell/passRate on existing nodes if mutated.
        const role = this.roles.get(a.id);
        if (role) {
          for (const n of this.nodes) {
            if (n.agentId === a.id) {
              n.dwellMs = a.dwellMs;
              n.passRate = a.passRate;
            }
          }
        }
      }
    }
  }

  private rebuildRolesFromConfig() {
    this.roles.clear();
    const layerCounters: Record<2 | 3 | 4, number> = { 2: 0, 3: 0, 4: 0 };
    for (const a of this.config.agents) {
      const palette = LAYER_PALETTE[a.layer];
      const idx = layerCounters[a.layer]++;
      const color = palette[idx % palette.length];
      this.roles.set(a.id, {
        agentId: a.id,
        layer: a.layer,
        role: a.role,
        color,
        shape: LAYER_SHAPE[a.layer],
        dwellMs: a.dwellMs,
        passRate: a.passRate,
      });
    }

    // Build source weights — sum each watcherRole's weight from enabled sources.
    const weights: Record<string, number> = {};
    for (const ds of this.config.dataSources) {
      if (!ds.enabled) continue;
      const matching = this.config.agents.find(
        (a) => a.layer === 2 && a.role === ds.watcherRole && a.enabled,
      );
      if (!matching) continue;
      weights[matching.id] = (weights[matching.id] ?? 0) + ds.weight;
    }
    if (Object.keys(weights).length === 0) {
      // Fallback to even split across layer-2 agents so the visualizer still pulses.
      const layer2 = this.config.agents.filter((a) => a.layer === 2 && a.enabled);
      for (const a of layer2) weights[a.id] = 1;
    }
    this.sourceWeights = weights;
  }

  private spawnInstancesForAllRoles(animateBirth: boolean) {
    for (const a of this.config.agents) {
      if (!a.enabled) continue;
      this.spawnInstancesForAgent(a, animateBirth);
    }
  }

  private spawnInstancesForAgent(a: AgentDef, animateBirth: boolean) {
    const role = this.roles.get(a.id);
    if (!role) return;
    const layerAgents = this.config.agents.filter((x) => x.layer === a.layer && x.enabled);
    const targetTotal = CONFIG.initialInstancesByLayer[a.layer];
    const perAgent = Math.max(2, Math.ceil(targetTotal / Math.max(1, layerAgents.length / 2)));
    const indexInLayer = layerAgents.findIndex((x) => x.id === a.id);
    const layerCount = layerAgents.length;
    for (let i = 0; i < perAgent; i++) {
      const angleOffset = (i / perAgent) * (PI2 / Math.max(1, layerCount));
      const baseAngle = (indexInLayer / Math.max(1, layerCount)) * PI2 - Math.PI / 2;
      const angle = baseAngle + angleOffset + rand(-0.04, 0.04);
      this.spawnNode(role, angle, animateBirth);
    }
  }

  private spawnNode(role: RoleSpec, angle: number, animateBirth: boolean, parent?: SimNode) {
    const r = this.layerR[role.layer];
    const targetX = this.cx + Math.cos(angle) * r;
    const targetY = this.cy + Math.sin(angle) * r;
    const startX = animateBirth && parent ? parent.drawX : targetX;
    const startY = animateBirth && parent ? parent.drawY : targetY;
    const id = this.nextNodeId++;
    const node: SimNode = {
      id,
      agentId: role.agentId,
      layer: role.layer,
      role: role.role,
      color: role.color,
      shape: role.shape,
      angle,
      x: targetX,
      y: targetY,
      drawX: startX,
      drawY: startY,
      state: animateBirth ? 'spawning' : 'idle',
      stateStartMs: performance.now(),
      dwellMs: role.dwellMs,
      passRate: role.passRate,
      willPass: false,
      noiseSeed: id * 0.183 + Math.random() * 0.05,
      birthScale: animateBirth ? 0.3 : 1,
      scaleBoost: 1,
      desat: 0,
      alphaMul: animateBirth ? 0 : 1,
      _dead: false,
    };
    this.nodes.push(node);
    this.nodesByLayer[role.layer].push(node);

    if (animateBirth && !this.reducedMotion) {
      if (parent) {
        gsap.to(parent, {
          scaleBoost: 1.12,
          duration: 0.18,
          ease: 'power2.out',
          onComplete: () => {
            if (!parent._dead)
              gsap.to(parent, { scaleBoost: 1, duration: 0.22, ease: 'power2.inOut' });
          },
        });
      }
      const tl = gsap.timeline({
        onComplete: () => {
          if (!node._dead) {
            node.state = 'idle';
          }
        },
      });
      tl.to(node, { birthScale: 1.05, alphaMul: 1, duration: 0.4, ease: 'power1.out' }, 0);
      tl.to(node, { drawX: targetX, drawY: targetY, duration: 0.4, ease: 'power1.out' }, 0);
      tl.to(node, { birthScale: 1, duration: 0.3, ease: 'back.out(1.7)' });
    } else if (animateBirth) {
      node.state = 'idle';
      node.birthScale = 1;
      node.alphaMul = 1;
      node.drawX = targetX;
      node.drawY = targetY;
    }
    return node;
  }

  private despawnNode(node: SimNode) {
    if (node._dead || node.state === 'despawning') return;
    if (node.incomingTracerId) return;
    node.state = 'despawning';
    node.stateStartMs = performance.now();
    if (!this.reducedMotion) {
      const dx = (this.cx - node.drawX) * 0.05;
      const dy = (this.cy - node.drawY) * 0.05;
      gsap.to(node, {
        birthScale: 0.4,
        alphaMul: 0,
        drawX: node.drawX + dx,
        drawY: node.drawY + dy,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => {
          node._dead = true;
        },
      });
    } else {
      node._dead = true;
    }
  }

  // ---------- layout ----------
  resize() {
    const cssW = this.canvas.clientWidth || this.canvas.width;
    const cssH = this.canvas.clientHeight || this.canvas.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = cssW;
    this.height = cssH;
    this.cx = cssW / 2;
    this.cy = cssH / 2 - 12;
    this.minDim = Math.min(cssW, cssH);
    this.layerR = {
      1: this.minDim * 0.5 * CONFIG.layerRadiusFactor[1],
      2: this.minDim * 0.5 * CONFIG.layerRadiusFactor[2],
      3: this.minDim * 0.5 * CONFIG.layerRadiusFactor[3],
      4: this.minDim * 0.5 * CONFIG.layerRadiusFactor[4],
    };

    this.initOfficePositions();
    for (const n of this.nodes) {
      const r = this.layerR[n.layer];
      n.x = this.cx + Math.cos(n.angle) * r;
      n.y = this.cy + Math.sin(n.angle) * r;
      if (n.state === 'idle' || n.state === 'processing' || n.state === 'cooling') {
        n.drawX = n.x;
        n.drawY = n.y;
      }
    }
  }

  // ---------- offices ----------
  private initOffices() {
    const N = CONFIG.intakeCount;
    this.intakeOffices = new Array(N);
    this.multiSubmitterSet.clear();
    const multiCount = Math.min(N, Math.floor(N * CONFIG.multiSubmitterPct));
    let safety = multiCount * 4;
    while (this.multiSubmitterSet.size < multiCount && safety-- > 0) {
      this.multiSubmitterSet.add(randInt(0, N - 1));
    }
    this.initOfficePositions();
  }

  private initOfficePositions() {
    const N = CONFIG.intakeCount;
    const r = this.layerR[1];
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * PI2 - Math.PI / 2;
      const x = this.cx + Math.cos(angle) * r;
      const y = this.cy + Math.sin(angle) * r;
      this.intakeOffices[i] = { angle, x, y };
    }
  }

  // ---------- preroll ----------
  private preroll(realSeconds: number) {
    if (realSeconds <= 0) return;
    const stepMs = 50;
    const total = realSeconds * 1000;
    for (let t = 0; t < total; t += stepMs) this.advance(stepMs / 1000, false);
    this.lastFrame = performance.now();
  }

  // ---------- visibility ----------
  private handleVisibility() {
    this.tabHidden = document.hidden;
    if (!this.tabHidden) this.lastFrame = performance.now();
  }

  // ---------- click ----------
  private handleClick(ev: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    let best: SimNode | null = null;
    let bestDist = 14 * 14;
    for (const n of this.nodes) {
      if (n._dead) continue;
      const dx = n.drawX - x;
      const dy = n.drawY - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = n;
      }
    }
    if (best && this.onEvent) {
      this.onEvent({ kind: 'node-clicked', agentId: best.agentId });
    }
  }

  // ---------- main ticker ----------
  private onTick() {
    if (this.tabHidden || this.paused) {
      this.lastFrame = performance.now();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.advance(dt, true);
  }

  private advance(dt: number, doRender: boolean) {
    if (this.config.status === 'unconfigured') {
      if (doRender) this.renderEmpty();
      return;
    }
    const now = performance.now();
    const timeScale = 86400 / CONFIG.realSecondsPerDay;
    const permitsPerSec = CONFIG.totalPermitsPerDay / CONFIG.realSecondsPerDay;
    this.simTime += dt * timeScale;
    this.permitAccum += permitsPerSec * dt;
    let safety = 200;
    while (this.permitAccum >= 1 && safety-- > 0) {
      this.permitAccum -= 1;
      this.spawnPermit(now);
    }
    this.updateTracers(now);
    this.updateNodes(now);
    this.decayPulses(now);
    this.updateOperations(now);
    if (now - this.lastReplicationCheck > CONFIG.replicationCheckMs) {
      this.checkReplication(now);
      this.lastReplicationCheck = now;
    }
    this.updateCostPerReport(dt);

    if (doRender) {
      this.render(now);
      if (now - this.lastHudPush > 100) {
        this.lastHudPush = now;
        this.onEvent?.({
          kind: 'hud',
          hud: {
            signalsProcessed: this.signalsProcessed,
            signalsRejected: this.signalsRejected,
            decisionsMade: this.decisionsMade,
            valueSurfaced: this.valueSurfaced,
            reportsDelivered: this.reportsDelivered,
            activeNodes: this.activeNodeCount,
            costPerReport: this.costPerReport,
          },
        });
      }
    }
  }

  // ---------- spawn permit ----------
  private spawnPermit(now: number) {
    if (Math.random() >= CONFIG.visibleTracerProbability) return;
    if (Object.keys(this.sourceWeights).length === 0) return;
    let officeIdx: number;
    if (Math.random() < 0.3 && this.multiSubmitterSet.size > 0) {
      const arr = Array.from(this.multiSubmitterSet);
      officeIdx = arr[Math.floor(Math.random() * arr.length)];
    } else {
      officeIdx = Math.floor(Math.random() * CONFIG.intakeCount);
    }
    const targetAgentId = pickWeighted(this.sourceWeights);
    const tracer = this.spawnIntakeTracer(officeIdx, targetAgentId, now);
    if (!tracer) return;
    this.activePulses.set(officeIdx, { startMs: now });
    this.signalsProcessed += 1;
  }

  private spawnIntakeTracer(officeIdx: number, agentId: string, now: number) {
    const office = this.intakeOffices[officeIdx];
    const target = this.findNearestIdleNodeByAgentId(2, office.angle, agentId);
    if (!target) return null;
    const role = this.roles.get(agentId);
    if (!role) return null;
    const opId = this.nextOperationId++;
    this.operations.set(opId, {
      id: opId,
      chain: [{ x: office.x, y: office.y, layer: 1, nodeId: -1, role: null }],
      state: 'in_progress',
      startMs: now,
      completionMs: 0,
      sourceRole: role.role,
      inputTitle: role.role + ' intake',
    });

    target.incomingTracerId = this.nextTracerId;
    const t: Tracer = {
      id: this.nextTracerId++,
      fromX: office.x,
      fromY: office.y,
      toX: target.x,
      toY: target.y,
      startMs: now,
      travelMs: rand(CONFIG.tracerTravelMsRange[0], CONFIG.tracerTravelMsRange[1]),
      targetNodeId: target.id,
      role: role.role,
      color: role.color,
      layer: 2,
      operationId: opId,
      history: [],
    };
    this.tracers.push(t);
    return t;
  }

  private findNearestIdleNodeByAgentId(
    layer: 2 | 3 | 4,
    angle: number,
    agentId: string,
  ): SimNode | null {
    const layerNodes = this.nodesByLayer[layer];
    if (!layerNodes || layerNodes.length === 0) return null;
    const SECTOR_HALF = Math.PI / 6;
    let best: SimNode | null = null;
    let bestScore = Infinity;
    for (const n of layerNodes) {
      if (n._dead || n.state !== 'idle' || n.incomingTracerId) continue;
      if (n.agentId !== agentId) continue;
      const da = angularDist(n.angle, angle);
      if (da > SECTOR_HALF) continue;
      if (da < bestScore) {
        bestScore = da;
        best = n;
      }
    }
    if (!best) {
      // Fallback: any idle node of the same agentId regardless of sector.
      let fallbackBest: SimNode | null = null;
      let fb = Infinity;
      for (const n of layerNodes) {
        if (n._dead || n.state !== 'idle' || n.incomingTracerId) continue;
        if (n.agentId !== agentId) continue;
        const da = angularDist(n.angle, angle);
        if (da < fb) {
          fb = da;
          fallbackBest = n;
        }
      }
      return fallbackBest;
    }
    return best;
  }

  private findNearestIdleDownstreamNode(fromNode: SimNode): SimNode | null {
    const targetLayer = (fromNode.layer + 1) as 2 | 3 | 4;
    if (targetLayer > 4) return null;
    const layerNodes = this.nodesByLayer[targetLayer];
    if (!layerNodes || layerNodes.length === 0) return null;
    // Build set of allowed downstream agentIds.
    const sourceAgent = this.config.agents.find((a) => a.id === fromNode.agentId);
    let allowed: Set<string> | null = null;
    if (sourceAgent && sourceAgent.outputTo && sourceAgent.outputTo.length > 0) {
      allowed = new Set(sourceAgent.outputTo);
    }
    const SECTOR_HALF = Math.PI / 5; // a bit wider for inner layers
    let best: SimNode | null = null;
    let bestScore = Infinity;
    for (const n of layerNodes) {
      if (n._dead || n.state !== 'idle' || n.incomingTracerId) continue;
      if (allowed && !allowed.has(n.agentId)) continue;
      const da = angularDist(n.angle, fromNode.angle);
      if (da > SECTOR_HALF) continue;
      if (da < bestScore) {
        bestScore = da;
        best = n;
      }
    }
    if (!best) {
      // Fallback to any idle downstream node.
      for (const n of layerNodes) {
        if (n._dead || n.state !== 'idle' || n.incomingTracerId) continue;
        if (allowed && !allowed.has(n.agentId)) continue;
        const da = angularDist(n.angle, fromNode.angle);
        if (da < bestScore) {
          bestScore = da;
          best = n;
        }
      }
    }
    return best;
  }

  private spawnLayerTracer(fromNode: SimNode, now: number): boolean {
    const targetLayer = fromNode.layer + 1;
    const opId = fromNode.operationId ?? this.nextOperationId++;

    if (targetLayer > 4) {
      const t: Tracer = {
        id: this.nextTracerId++,
        fromX: fromNode.x,
        fromY: fromNode.y,
        toX: this.cx,
        toY: this.cy,
        startMs: now,
        travelMs: rand(CONFIG.tracerTravelMsRange[0], CONFIG.tracerTravelMsRange[1]),
        targetNodeId: -1,
        layer: 5,
        role: fromNode.role,
        color: fromNode.color,
        operationId: opId,
        history: [],
      };
      this.tracers.push(t);
      return true;
    }

    const target = this.findNearestIdleDownstreamNode(fromNode);
    if (!target) return false;
    target.incomingTracerId = this.nextTracerId;
    const t: Tracer = {
      id: this.nextTracerId++,
      fromX: fromNode.x,
      fromY: fromNode.y,
      toX: target.x,
      toY: target.y,
      startMs: now,
      travelMs: rand(CONFIG.tracerTravelMsRange[0], CONFIG.tracerTravelMsRange[1]),
      targetNodeId: target.id,
      layer: targetLayer as 2 | 3 | 4,
      role: target.role,
      color: target.color,
      operationId: opId,
      history: [],
    };
    this.tracers.push(t);
    return true;
  }

  // ---------- update tracers ----------
  private updateTracers(now: number) {
    const live: Tracer[] = [];
    for (const t of this.tracers) {
      const dt = now - t.startMs;
      if (dt >= t.travelMs) {
        if (t.layer === 5) {
          this.centerPulseStart = now;
          this.reportsDelivered += 1;
          const value =
            randInt(CONFIG.valuePerReportRange[0], CONFIG.valuePerReportRange[1]);
          this.valueSurfaced += value;
          this.markOperationDone(t.operationId, 'completed');
          this.onEvent?.({
            kind: 'report-delivered',
            valueSurfaced: this.valueSurfaced,
            reports: this.reportsDelivered,
          });
        } else {
          const node = this.findNodeById(t.targetNodeId);
          if (
            node &&
            !node._dead &&
            node.state === 'idle' &&
            node.incomingTracerId === t.id
          ) {
            this.activateNode(node, now, t.operationId);
          } else {
            if (node && node.incomingTracerId === t.id) node.incomingTracerId = undefined;
            this.signalsRejected += 1;
            this.markOperationDone(t.operationId, 'rejected');
          }
        }
        continue;
      }
      live.push(t);
    }
    this.tracers = live;
  }

  private findNodeById(id: number): SimNode | null {
    for (const n of this.nodes) if (n.id === id) return n;
    return null;
  }

  private activateNode(node: SimNode, now: number, operationId: number) {
    node.state = 'processing';
    node.stateStartMs = now;
    node.willPass = Math.random() < node.passRate;
    node.incomingTracerId = undefined;
    node.operationId = operationId;
    if (!this.reducedMotion) {
      gsap.to(node, { scaleBoost: 1.18, duration: 0.4, ease: 'back.out(2.2)' });
      gsap.to(node, { scaleBoost: 1, duration: 0.5, ease: 'power2.out', delay: 0.4 });
    }
    const op = this.operations.get(operationId);
    if (op) {
      op.chain.push({
        x: node.x,
        y: node.y,
        layer: node.layer,
        nodeId: node.id,
        role: node.role,
      });
    }
  }

  private markOperationDone(opId: number, outcome: 'completed' | 'rejected') {
    const op = this.operations.get(opId);
    if (!op || op.state !== 'in_progress') return;
    op.state = outcome;
    op.completionMs = performance.now();
    for (const link of op.chain) {
      if (link.nodeId === -1) continue;
      const node = this.findNodeById(link.nodeId);
      if (!node || node._dead) continue;
      if (node.state === 'engaged' || node.state === 'processing') {
        const wasEngaged = node.state === 'engaged';
        node.state = 'cooling';
        node.stateStartMs = op.completionMs;
        node.coolingStartIntensity = wasEngaged ? 0.5 : 1;
      }
    }
  }

  // ---------- update nodes ----------
  private updateNodes(now: number) {
    let activeCount = 0;
    const survivors: SimNode[] = [];
    for (const node of this.nodes) {
      if (node._dead) continue;
      if (node.state === 'processing') {
        activeCount++;
        const elapsed = now - node.stateStartMs;
        if (elapsed >= node.dwellMs) {
          let didPass = false;
          if (node.willPass) didPass = this.spawnLayerTracer(node, now);
          if (didPass) {
            this.decisionsMade += 1;
            if (!this.reducedMotion) {
              gsap.to(node, { scaleBoost: 1.08, duration: 0.12, ease: 'power2.out' });
              gsap.to(node, { scaleBoost: 1, duration: 0.13, ease: 'power2.out', delay: 0.12 });
            }
            node.state = 'engaged';
            node.stateStartMs = now;
          } else {
            this.signalsRejected += 1;
            if (!this.reducedMotion) {
              gsap.to(node, { desat: 0.7, duration: 0.4, ease: 'power1.inOut' });
              gsap.to(node, { desat: 0, duration: 0.6, ease: 'power1.inOut', delay: 0.4 });
              gsap.to(node, { scaleBoost: 0.92, duration: 0.3, ease: 'power2.out' });
              gsap.to(node, { scaleBoost: 1, duration: 0.5, ease: 'power1.inOut', delay: 0.3 });
            }
            if (node.operationId != null) {
              this.markOperationDone(node.operationId, 'rejected');
            } else {
              node.state = 'cooling';
              node.stateStartMs = now;
              node.coolingStartIntensity = 1;
            }
          }
        }
      } else if (node.state === 'engaged') {
        activeCount++;
      } else if (node.state === 'cooling') {
        activeCount++;
        const elapsed = now - node.stateStartMs;
        if (elapsed >= CONFIG.decayMs) {
          node.state = 'idle';
          node.operationId = undefined;
          node.coolingStartIntensity = undefined;
        }
      }
      survivors.push(node);
    }
    this.nodes = survivors;
    this.nodesByLayer = { 2: [], 3: [], 4: [] };
    for (const n of survivors) this.nodesByLayer[n.layer].push(n);
    this.activeNodeCount = activeCount;
  }

  // ---------- operations cleanup ----------
  private updateOperations(now: number) {
    const decayMs = CONFIG.decayMs;
    const staleMs = 60000;
    for (const [id, op] of this.operations) {
      if (op.state === 'in_progress') {
        if (now - op.startMs > staleMs) this.markOperationDone(id, 'rejected');
        continue;
      }
      if (op.completionMs && now - op.completionMs > decayMs + 500) {
        this.operations.delete(id);
      }
    }
  }

  // ---------- pulses ----------
  private decayPulses(now: number) {
    for (const [k, v] of this.activePulses) {
      if (now - v.startMs > CONFIG.pulseDurationMs) this.activePulses.delete(k);
    }
  }

  // ---------- replication ----------
  private checkReplication(now: number) {
    const SECTORS = 12;
    for (const layer of [2, 3, 4] as const) {
      const max = CONFIG.maxInstancesByLayer[layer];
      if (this.nodesByLayer[layer].length >= max) continue;
      const incoming = new Array(SECTORS).fill(0);
      const idle = new Array(SECTORS).fill(0);
      for (const t of this.tracers) {
        if (t.layer !== layer) continue;
        const a = Math.atan2(t.toY - this.cy, t.toX - this.cx);
        const s = Math.floor(((a + Math.PI) / PI2) * SECTORS) % SECTORS;
        incoming[s]++;
      }
      for (const n of this.nodesByLayer[layer]) {
        if (n._dead || n.state !== 'idle') continue;
        const s = Math.floor(((n.angle + Math.PI) / PI2) * SECTORS) % SECTORS;
        idle[s]++;
      }
      for (let s = 0; s < SECTORS; s++) {
        const pressure = incoming[s] - idle[s];
        if (pressure < CONFIG.replicationExcess) continue;
        const key = `${layer}-${s}`;
        const last = this.sectorCooldown.get(key) ?? 0;
        if (now - last < CONFIG.replicationCooldownMs) continue;
        this.sectorCooldown.set(key, now);
        // Pick a node in this sector to mitose.
        const sectorNodes = this.nodesByLayer[layer].filter((n) => {
          const a = Math.floor(((n.angle + Math.PI) / PI2) * SECTORS) % SECTORS;
          return a === s && !n._dead;
        });
        if (sectorNodes.length === 0) continue;
        const parent = sectorNodes[Math.floor(Math.random() * sectorNodes.length)];
        const role = this.roles.get(parent.agentId);
        if (!role) continue;
        const newAngle = parent.angle + rand(-0.08, 0.08);
        this.spawnNode(role, newAngle, true, parent);
      }
    }
  }

  // ---------- cost drift ----------
  private updateCostPerReport(_dt: number) {
    const now = performance.now();
    if (now - this.costPerReportLastShift > 1500) {
      this.costPerReportTarget =
        CONFIG.costPerReportRange[0] +
        Math.random() * (CONFIG.costPerReportRange[1] - CONFIG.costPerReportRange[0]);
      this.costPerReportLastShift = now;
    }
    this.costPerReport = lerp(this.costPerReport, this.costPerReportTarget, 0.02);
  }

  // ---------- render ----------
  private renderEmpty() {
    const ctx = this.ctx;
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawDotGrid();
    this.drawOuterRing(performance.now(), false);
    // Soft pulsing center dot to indicate Architect is thinking.
    const t = (performance.now() / 1000) % PI2;
    const a = 0.4 + 0.4 * Math.sin(t * 1.4);
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 4, 0, PI2);
    // Pulsing center dot: Atrium warn color (was #FBBF24/rgb(251,191,36)).
    ctx.fillStyle = `rgba(${_AMBER_RGB.r | 0}, ${_AMBER_RGB.g | 0}, ${_AMBER_RGB.b | 0}, ${a.toFixed(3)})`;
    ctx.fill();
  }

  private render(now: number) {
    const ctx = this.ctx;
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawDotGrid();
    this.drawOuterRing(now, true);
    this.drawTracers(now);
    this.drawNodes(now);
    this.drawCenter(now);
  }

  private drawDotGrid() {
    const ctx = this.ctx;
    const step = 24;
    // Even softer than --border-faint (0.04). Sub-token by design — the dot
    // grid is meant to barely register against --bg-ground.
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = step; x < this.width; x += step) {
      for (let y = step; y < this.height; y += step) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  private drawOuterRing(now: number, drawPulses: boolean) {
    const ctx = this.ctx;
    const r = this.layerR[1];
    const dashLen = 5;
    const breath = CONFIG.outerRingBreathing
      ? 1 + 0.005 * Math.sin(now / 1500)
      : 1;
    const N = CONFIG.intakeCount;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < N; i++) {
      const o = this.intakeOffices[i];
      const cosA = Math.cos(o.angle);
      const sinA = Math.sin(o.angle);
      const isHot = drawPulses && this.activePulses.has(i);
      const pulse = isHot ? this.activePulses.get(i)! : null;
      let color = COLOR_DASH_IDLE;
      let alpha = 0.95;
      if (pulse) {
        const t = clamp((now - pulse.startMs) / CONFIG.pulseDurationMs, 0, 1);
        const k = 1 - t;
        color = lerpRgb(COLOR_DASH_IDLE, COLOR_DASH_HOT, k);
        alpha = 0.95 + 0.05 * k;
      }
      const fromX = this.cx + cosA * r * breath;
      const fromY = this.cy + sinA * r * breath;
      const toX = this.cx + cosA * (r - dashLen) * breath;
      const toY = this.cy + sinA * (r - dashLen) * breath;
      ctx.strokeStyle = rgbToCss(color, alpha);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    }
  }

  private drawTracers(now: number) {
    const ctx = this.ctx;
    for (const t of this.tracers) {
      const elapsed = now - t.startMs;
      const tt = clamp(elapsed / t.travelMs, 0, 1);
      const e = easeInOutCubic(tt);
      const x = lerp(t.fromX, t.toX, e);
      const y = lerp(t.fromY, t.toY, e);
      t.history.push({ x, y, ms: now });
      if (t.history.length > CONFIG.trailLength) t.history.shift();
      const tcol = trailColorForLayer(t.layer, t.color);
      // Trail
      for (let i = 0; i < t.history.length - 1; i++) {
        const p = t.history[i];
        const np = t.history[i + 1];
        const a = (i / t.history.length) * 0.8;
        ctx.strokeStyle = rgbToCss(tcol, a);
        ctx.lineWidth = 1.5 + (i / t.history.length) * 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(np.x, np.y);
        ctx.stroke();
      }
      // Head
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, PI2);
      ctx.fillStyle = rgbToCss(tcol, 1);
      ctx.fill();
    }
  }

  private drawNodes(now: number) {
    const ctx = this.ctx;
    const noiseTime = now / 1000;
    for (const n of this.nodes) {
      if (n._dead) continue;
      const baseSize = n.layer === 2 ? 6 : n.layer === 3 ? 7 : 8;
      const size = baseSize * n.birthScale * n.scaleBoost;

      // Idle nodes drift via simplex noise (subtle).
      let dx = 0;
      let dy = 0;
      if (n.state === 'idle') {
        const nx = this.noise2D(noiseTime * 0.25, n.noiseSeed);
        const ny = this.noise2D(n.noiseSeed, noiseTime * 0.25);
        dx = nx * 0.9;
        dy = ny * 0.9;
      }

      const x = n.drawX + dx;
      const y = n.drawY + dy;
      const colorRgb = hexToRgb(n.color);
      const idleColor = lerpRgb(COLOR_NODE_IDLE, colorRgb, 0.25);

      let fillRgb = idleColor;
      let strokeRgb = colorRgb;
      let fillAlpha = 0.55 * n.alphaMul;
      let strokeAlpha = 0.85 * n.alphaMul;
      let progress = 0;

      if (n.state === 'processing') {
        progress = clamp((now - n.stateStartMs) / n.dwellMs, 0, 1);
        fillRgb = colorRgb;
        fillAlpha = 0.85 * n.alphaMul;
        strokeAlpha = 1 * n.alphaMul;
      } else if (n.state === 'engaged') {
        fillRgb = colorRgb;
        fillAlpha = 0.55 * n.alphaMul;
        strokeAlpha = 0.85 * n.alphaMul;
      } else if (n.state === 'cooling') {
        const t = clamp((now - n.stateStartMs) / CONFIG.decayMs, 0, 1);
        const intensity = (n.coolingStartIntensity ?? 1) * (1 - easeOutCubic(t));
        fillRgb = lerpRgb(idleColor, colorRgb, intensity);
        fillAlpha = (0.55 + 0.3 * intensity) * n.alphaMul;
        strokeAlpha = (0.7 + 0.3 * intensity) * n.alphaMul;
      } else if (n.state === 'idle') {
        if (n.desat > 0) {
          fillRgb = lerpRgb(idleColor, COLOR_NODE_IDLE, n.desat);
          strokeRgb = lerpRgb(colorRgb, COLOR_NODE_IDLE, n.desat);
        }
      }

      // Fill
      pathByShape(ctx, n.shape, x, y, size);
      ctx.fillStyle = rgbToCss(fillRgb, fillAlpha);
      ctx.fill();

      // Stroke (full perimeter when not processing, partial when processing)
      ctx.strokeStyle = rgbToCss(strokeRgb, strokeAlpha);
      ctx.lineWidth = 1.4;
      if (n.state === 'processing') {
        // Full faint perimeter
        pathByShape(ctx, n.shape, x, y, size);
        ctx.strokeStyle = rgbToCss(strokeRgb, 0.25 * n.alphaMul);
        ctx.stroke();
        // Progress arc / outline trace
        strokeShapePartial(
          ctx,
          n.shape,
          x,
          y,
          size,
          progress,
          rgbToCss(strokeRgb, 1 * n.alphaMul),
          1.8,
        );
      } else {
        pathByShape(ctx, n.shape, x, y, size);
        ctx.stroke();
      }
    }
  }

  private drawCenter(now: number) {
    const ctx = this.ctx;
    const baseR = CONFIG.centerRadius;
    let r = baseR;
    let strokeAlpha = 0.85;
    if (this.centerPulseStart > 0) {
      const t = clamp((now - this.centerPulseStart) / 700, 0, 1);
      r = baseR + 18 * easeOutCubic(t);
      strokeAlpha = 0.85 * (1 - t);
    }
    // Outer pulse ring
    if (strokeAlpha > 0.02 && r > baseR + 0.2) {
      ctx.strokeStyle = `rgba(255,255,255,${strokeAlpha.toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, PI2);
      ctx.stroke();
    }
    // Solid black fill with white stroke
    ctx.fillStyle = CANVAS_BG;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, baseR, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, baseR, 0, PI2);
    ctx.stroke();
  }
}
