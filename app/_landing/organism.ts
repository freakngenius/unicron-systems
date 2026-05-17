// @ts-nocheck — Faithful port of vanilla JS canvas engine. Already typed as
// `any` throughout; tsconfig's `noUncheckedIndexedAccess` flags every
// `nodes[i]` / `edges[i]` / `candidates[i]` access even though the
// surrounding logic guarantees presence. Disabling the type check on this
// one module avoids littering the algorithm with non-null assertions.
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * UNICRON ORGANISM — Light theme (v8 landing).
 *
 * Ported verbatim from Web/Unicron Landing/Unicron Landing.html — the
 * Claude Design source. The runtime "tweak panel" + applyTweaks/font loader
 * machinery is stripped; the values Kyle locked in via the panel are baked
 * into the `tweaks` constant below. If you need to retune, edit those numbers
 * directly — there is no longer a live panel.
 *
 * Exports `startOrganism({ canvas, feedInner })` which initializes the canvas
 * graph engine, ambient pulse traversal, ephemeral arms, ghost spawns, click
 * → core fires, and the scrolling "Live Signal" feed. Returns a cleanup
 * function that cancels the rAF loop, all timers, and the resize listener so
 * React can unmount cleanly under HMR.
 */

type Opts = { canvas: HTMLCanvasElement; feedInner: HTMLElement };

export function startOrganism({ canvas, feedInner }: Opts): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  // Tweaks Kyle baked in via the Claude Design panel.
  const tweaks = {
    orgScale: 3.6,
    primaryArms: 6,
    fastArms: 5,
    edgeAlpha: 0.24,
    edgeThickness: 0.7,
    digitOpacity: 0.33,
    _edgeRgb: [28, 42, 56] as [number, number, number],   // #1c2a38
    _tracerRgb: [210, 216, 221] as [number, number, number], // #d2d8dd
    _digitRgb: [70, 100, 122] as [number, number, number],   // #46647a
  };

  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0,
    H = 0;
  let CX = 0,
    CY = 0;

  const startTime = performance.now();
  let nodes: any[] = [];
  let edges: any[] = [];
  let pulses: any[] = [];
  let ripples: any[] = [];
  let ghosts: any[] = [];
  let directFires: any[] = [];
  let hexDigits: any[] = [];
  let edgeParticles: any[] = [];
  const cursor = { x: -9999, y: -9999, active: false };

  const MAX_FEED_LINES = 7;
  const feedLines: HTMLElement[] = [];
  let activityImpulse = 0;

  // Cleanup tracking — every setTimeout id, the rAF id, and the abort
  // controller for listeners. Cleanup returned from startOrganism cancels all.
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  const safeSetTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      fn();
    }, ms);
    pendingTimers.add(id);
    return id;
  };
  const abort = new AbortController();
  let rafId = 0;
  let stopped = false;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
    const isMobile = W < 900;
    CX = isMobile ? W * 0.5 : W * 0.68;
    if (isMobile) {
      // Mobile: glass pane reflows to a full-width top bar; center the
      // organism in the space between the pane bottom and the viewport
      // bottom so it isn't hidden behind the pane.
      const pane = document.querySelector(".hero-pane");
      const paneBottom = pane ? pane.getBoundingClientRect().bottom : H * 0.4;
      CY = (paneBottom + H) / 2;
    } else {
      CY = H * 0.5;
    }
    // Expose the organism center as CSS vars so the arm anchor can track
    // the core hex without duplicating positioning logic in CSS.
    document.documentElement.style.setProperty("--organism-cx", `${CX}px`);
    document.documentElement.style.setProperty("--organism-cy", `${CY}px`);
    buildOrganism();
    initHex();
    initEdgeParticles();
  }

  /* ───────── ORGANISM ───────── */
  let ephemeralArms: any[] = [];

  function buildOrganism() {
    const SCALE = tweaks.orgScale;
    const base = (Math.min(W, H) / 2) * SCALE;
    const isMobile = W < 900;
    nodes = [];
    edges = [];
    pulses = [];
    ghosts = [];
    directFires = [];
    ephemeralArms = [];

    nodes.push(
      makeNode({
        rx: 0,
        ry: 0,
        level: 0,
        type: "core",
        shape: "hex",
        size: 11,
        baseGlow: 0.85,
        hue: "core",
        wakeAt: 100,
        driftAmp: 0,
      }),
    );

    const primaryCount = Math.max(1, Math.min(8, tweaks.primaryArms));
    const fastCount = Math.max(0, Math.min(6, tweaks.fastArms));
    const ARM_CONFIGS: any[] = [];
    for (let i = 0; i < primaryCount; i++) {
      ARM_CONFIGS.push({
        primary: true,
        aliveMin: 24000,
        aliveMax: 55000,
        dormantMin: 1200,
        dormantMax: 3500,
      });
    }
    for (let i = 0; i < fastCount; i++) {
      ARM_CONFIGS.push({
        primary: false,
        aliveMin: 9000,
        aliveMax: 20000,
        dormantMin: 3500,
        dormantMax: 11000,
      });
    }
    const NUM_EPHEMERAL = ARM_CONFIGS.length;
    const primaryAngleBase = Math.random() * Math.PI * 2;
    let primaryIdx = 0;

    for (let armI = 0; armI < NUM_EPHEMERAL; armI++) {
      const cfg = ARM_CONFIGS[armI];
      const arm: any = {
        cfg,
        state: "dormant",
        stateStart: 0,
        nextSpawnTime: 6000 + Math.random() * 8000,
        nodeIdxs: [] as number[],
        baseRadius: base,
      };
      const hubDist = base * (isMobile ? 0.07 : 0.065) * (0.9 + Math.random() * 0.2);
      const hubIdx = nodes.length;
      nodes.push(
        makeNode({
          rx: hubDist,
          ry: 0,
          level: 1,
          type: "synthesis",
          shape: "diamond",
          size: 4.8,
          baseGlow: 0.13,
          hue: "teal",
          wakeAt: 0,
          driftAmp: 2.5,
          parent: 0,
          lifeOpacity: 0,
          routable: false,
          ephemeralArm: armI,
        }),
      );
      edges.push(makeEdge(0, hubIdx));
      arm.nodeIdxs.push(hubIdx);
      arm.hubIdx = hubIdx;

      const orchCount = cfg.primary
        ? 2 + ((Math.random() * 3) | 0)
        : 1 + ((Math.random() * 2) | 0);
      for (let o = 0; o < orchCount; o++) {
        const orchAngleOffset = (Math.random() - 0.5) * 0.9;
        const orchDist = base * (isMobile ? 0.075 : 0.07) * (0.85 + Math.random() * 0.4);
        const orchRx = hubDist + Math.cos(orchAngleOffset) * orchDist;
        const orchRy = Math.sin(orchAngleOffset) * orchDist;
        const orchIdx = nodes.length;
        nodes.push(
          makeNode({
            rx: orchRx,
            ry: orchRy,
            level: 2,
            type: "orchestration",
            shape: "square",
            size: 3.4,
            baseGlow: 0.1,
            hue: "teal",
            wakeAt: 0,
            driftAmp: 4,
            parent: hubIdx,
            lifeOpacity: 0,
            routable: false,
            ephemeralArm: armI,
          }),
        );
        edges.push(makeEdge(hubIdx, orchIdx));
        arm.nodeIdxs.push(orchIdx);

        const recvCount = cfg.primary
          ? 1 + ((Math.random() * 3) | 0)
          : 1 + ((Math.random() * 2) | 0);
        for (let r = 0; r < recvCount; r++) {
          const recvAngleOffset = orchAngleOffset + (Math.random() - 0.5) * 1.2;
          const recvDist = base * (isMobile ? 0.07 : 0.065) * (0.85 + Math.random() * 0.4);
          const recvRx = orchRx + Math.cos(recvAngleOffset) * recvDist;
          const recvRy = orchRy + Math.sin(recvAngleOffset) * recvDist;
          const recvIdx = nodes.length;
          nodes.push(
            makeNode({
              rx: recvRx,
              ry: recvRy,
              level: 3,
              type: "receiving",
              shape: "triangle",
              size: 3.6,
              baseGlow: 0.085,
              hue: "teal",
              wakeAt: 0,
              driftAmp: 5,
              parent: orchIdx,
              lifeOpacity: 0,
              routable: false,
              ephemeralArm: armI,
            }),
          );
          edges.push(makeEdge(orchIdx, recvIdx));
          arm.nodeIdxs.push(recvIdx);

          if (Math.random() < 0.75) {
            const origAngleOffset = recvAngleOffset + (Math.random() - 0.5) * 1.3;
            const origDist = base * (isMobile ? 0.065 : 0.06) * (0.85 + Math.random() * 0.4);
            const origIdx = nodes.length;
            const origRx = recvRx + Math.cos(origAngleOffset) * origDist;
            const origRy = recvRy + Math.sin(origAngleOffset) * origDist;
            nodes.push(
              makeNode({
                rx: origRx,
                ry: origRy,
                level: 4,
                type: "origination",
                shape: "circle",
                size: 2.4,
                baseGlow: 0.07,
                hue: "teal",
                wakeAt: 0,
                driftAmp: 6,
                parent: recvIdx,
                lifeOpacity: 0,
                routable: false,
                ephemeralArm: armI,
              }),
            );
            edges.push(makeEdge(recvIdx, origIdx));
            arm.nodeIdxs.push(origIdx);

            // Two more potential tendril generations beyond origination.
            let parentLevel = 4;
            let parentRx = origRx,
              parentRy = origRy;
            let parentAngle = origAngleOffset;
            let parentIdx = origIdx;
            for (let depth = 0; depth < 2; depth++) {
              if (Math.random() > (depth === 0 ? 0.7 : 0.55)) break;
              const childAngle = parentAngle + (Math.random() - 0.5) * 1.4;
              const childDist = base * (isMobile ? 0.06 : 0.055) * (0.8 + Math.random() * 0.5);
              const childRx = parentRx + Math.cos(childAngle) * childDist;
              const childRy = parentRy + Math.sin(childAngle) * childDist;
              const childLevel = parentLevel + 1;
              const childIdx = nodes.length;
              nodes.push(
                makeNode({
                  rx: childRx,
                  ry: childRy,
                  level: childLevel,
                  type: "tendril",
                  shape: "circle",
                  size: Math.max(1.6, 2.2 - depth * 0.3),
                  baseGlow: Math.max(0.04, 0.06 - depth * 0.01),
                  hue: "teal",
                  wakeAt: 0,
                  driftAmp: 7 + depth * 2,
                  parent: parentIdx,
                  lifeOpacity: 0,
                  routable: false,
                  ephemeralArm: armI,
                }),
              );
              edges.push(makeEdge(parentIdx, childIdx));
              arm.nodeIdxs.push(childIdx);
              parentLevel = childLevel;
              parentRx = childRx;
              parentRy = childRy;
              parentAngle = childAngle;
              parentIdx = childIdx;
            }
          }
        }
      }

      for (const idx of arm.nodeIdxs) {
        const n = nodes[idx];
        n.armRelX = n.rx;
        n.armRelY = n.ry;
      }

      // Sequence index for the staggered grow / fade — higher level appears
      // later during grow, disappears first during fade.
      const sorted = [...arm.nodeIdxs];
      sorted.sort((a: number, b: number) => {
        const dl = nodes[a].level - nodes[b].level;
        if (dl !== 0) return dl;
        return Math.random() - 0.5;
      });
      const N = sorted.length;
      for (let i = 0; i < N; i++) {
        nodes[sorted[i]].seqIdx = i;
        nodes[sorted[i]].seqTotal = N;
      }

      // Primary arms start 'alive' at evenly-spaced angles so the graph is
      // populated on load and stays mostly stable over time.
      if (cfg.primary) {
        const numPrimary = ARM_CONFIGS.filter((c: any) => c.primary).length;
        const angle =
          primaryAngleBase + (primaryIdx / numPrimary) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        primaryIdx++;
        const cos = Math.cos(angle),
          sin = Math.sin(angle);
        for (const idx of arm.nodeIdxs) {
          const n = nodes[idx];
          n.rx = n.armRelX * cos - n.armRelY * sin;
          n.ry = n.armRelX * sin + n.armRelY * cos;
          n.lifeOpacity = 1;
          n.routable = true;
        }
        arm.state = "alive";
        arm.stateStart =
          -((cfg.aliveMin + Math.random() * (cfg.aliveMax - cfg.aliveMin)) *
            Math.random() *
            0.6);
        arm.aliveDuration = cfg.aliveMin + Math.random() * (cfg.aliveMax - cfg.aliveMin);
      }

      ephemeralArms.push(arm);
    }

    addCrossConnections();
    buildAdjacency();
  }

  function makeNode(o: any) {
    return Object.assign(
      {
        x: 0,
        y: 0,
        glow: 0,
        target: 0,
        phase: Math.random() * Math.PI * 2,
        flicker: Math.random() * 0.4 + 0.85,
        driftPhaseX: Math.random() * Math.PI * 2,
        driftPhaseY: Math.random() * Math.PI * 2,
        driftSpeedX: 0.0004 + Math.random() * 0.0005,
        driftSpeedY: 0.0004 + Math.random() * 0.0005,
        parent: -1,
        lifeOpacity: 1,
        routable: true,
        growProgress: 1,
      },
      o,
    );
  }

  function makeEdge(from: number, to: number) {
    return {
      from,
      to,
      active: 0,
      curveOffset: (Math.random() - 0.5) * 14 + (Math.random() < 0.5 ? 4 : -4),
    };
  }

  function addCrossConnections() {
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.ephemeralArm !== undefined) continue;
      const maxD = 50 + node.level * 18;
      const candidates: { idx: number; d2: number }[] = [];
      for (let j = 1; j < nodes.length; j++) {
        if (j === i || j === node.parent) continue;
        if (nodes[j].parent === i) continue;
        if (nodes[j].ephemeralArm !== undefined) continue;
        if (Math.abs(nodes[j].level - node.level) > 1) continue;
        const dx = nodes[j].rx - node.rx;
        const dy = nodes[j].ry - node.ry;
        const d2 = dx * dx + dy * dy;
        if (d2 > maxD * maxD) continue;
        if (edges.some((e: any) => (e.from === i && e.to === j) || (e.from === j && e.to === i)))
          continue;
        candidates.push({ idx: j, d2 });
      }
      candidates.sort((a, b) => a.d2 - b.d2);
      const numCross = Math.random() < 0.55 ? 1 : Math.random() < 0.7 ? 2 : 0;
      for (let k = 0; k < Math.min(numCross, candidates.length); k++) {
        edges.push(makeEdge(i, candidates[k].idx));
      }
    }
  }

  let adjacency: { edgeIdx: number; other: number }[][] = [];
  function buildAdjacency() {
    adjacency = nodes.map(() => [] as { edgeIdx: number; other: number }[]);
    edges.forEach((e: any, i: number) => {
      adjacency[e.from].push({ edgeIdx: i, other: e.to });
      adjacency[e.to].push({ edgeIdx: i, other: e.from });
    });
  }

  function pickEmptyAngle() {
    const angles: number[] = [];
    for (const n of nodes) {
      if (n.level !== 1) continue;
      if ((n.lifeOpacity ?? 1) < 0.4) continue;
      angles.push(Math.atan2(n.ry, n.rx));
    }
    if (angles.length === 0) return Math.random() * Math.PI * 2;
    angles.sort((a, b) => a - b);
    let bestGap = 0,
      bestMid = Math.random() * Math.PI * 2;
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      const b = angles[(i + 1) % angles.length];
      let gap = b - a;
      if (gap < 0) gap += Math.PI * 2;
      if (gap > bestGap) {
        bestGap = gap;
        bestMid = a + gap / 2;
      }
    }
    const jitter = (Math.random() - 0.5) * bestGap * 0.6;
    return bestMid + jitter;
  }

  function repositionArm(arm: any, angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const idx of arm.nodeIdxs) {
      const n = nodes[idx];
      n.rx = n.armRelX * cos - n.armRelY * sin;
      n.ry = n.armRelX * sin + n.armRelY * cos;
      n.driftPhaseX = Math.random() * Math.PI * 2;
      n.driftPhaseY = Math.random() * Math.PI * 2;
      n.phase = Math.random() * Math.PI * 2;
    }
  }

  function updateEphemeralArms(elapsed: number) {
    const GROW_MS = 6500;
    const FADE_MS = 8500;
    const NODE_FADE_MS = 700;
    for (const arm of ephemeralArms) {
      const cfg = arm.cfg || {
        aliveMin: 12000,
        aliveMax: 30000,
        dormantMin: 4000,
        dormantMax: 14000,
      };
      const t = elapsed - arm.stateStart;
      const N = arm.nodeIdxs.length;

      function applyStagger(progress: number, reversed: boolean) {
        const spread = 1 - NODE_FADE_MS / (reversed ? FADE_MS : GROW_MS);
        for (const idx of arm.nodeIdxs) {
          const n = nodes[idx];
          const seqFrac = N <= 1 ? 0 : n.seqIdx / (N - 1);
          const startAt = (reversed ? 1 - seqFrac : seqFrac) * spread;
          const localT = (progress - startAt) / (1 - spread);
          const p = Math.max(0, Math.min(1, localT));
          const eased = reversed ? 1 - Math.pow(p, 2) : 1 - Math.pow(1 - p, 2);
          n.lifeOpacity = eased;
          n.growProgress = reversed ? 1 : eased;
        }
      }

      if (arm.state === "dormant") {
        if (t > arm.nextSpawnTime) {
          repositionArm(arm, pickEmptyAngle());
          arm.state = "growing";
          arm.stateStart = elapsed;
          arm.aliveDuration = cfg.aliveMin + Math.random() * (cfg.aliveMax - cfg.aliveMin);
        }
      } else if (arm.state === "growing") {
        const p = Math.min(1, t / GROW_MS);
        applyStagger(p, false);
        if (p >= 1) {
          for (const idx of arm.nodeIdxs) nodes[idx].routable = true;
          arm.state = "alive";
          arm.stateStart = elapsed;
        }
      } else if (arm.state === "alive") {
        if (t > arm.aliveDuration) {
          for (const idx of arm.nodeIdxs) nodes[idx].routable = false;
          arm.state = "fading";
          arm.stateStart = elapsed;
        }
      } else if (arm.state === "fading") {
        const p = Math.min(1, t / FADE_MS);
        applyStagger(p, true);
        if (p >= 1) {
          for (const idx of arm.nodeIdxs) nodes[idx].lifeOpacity = 0;
          arm.state = "dormant";
          arm.stateStart = elapsed;
          arm.nextSpawnTime = cfg.dormantMin + Math.random() * (cfg.dormantMax - cfg.dormantMin);
        }
      }
    }
  }

  /* ───────── HEX BACKGROUND ───────── */
  const HEX_CHARS = "0123456789ABCDEF";
  function hexChar() {
    return HEX_CHARS[(Math.random() * 16) | 0];
  }
  function initHex() {
    hexDigits.length = 0;
    const density = (W * H) / 36000;
    const n = Math.max(40, Math.min(110, Math.floor(density)));
    for (let i = 0; i < n; i++) {
      hexDigits.push({
        x: Math.random() * W,
        y: Math.random() * H,
        char: hexChar(),
        vy: 0.12 + Math.random() * 0.28,
        phase: Math.random() * Math.PI * 2,
        flickerSpeed: 0.015 + Math.random() * 0.03,
        nextSwap: 1200 + Math.random() * 4000,
        lastSwap: 0,
      });
    }
  }
  function drawHex(elapsed: number) {
    ctx!.font = '10px "JetBrains Mono", monospace';
    ctx!.textAlign = "left";
    ctx!.textBaseline = "top";
    for (const d of hexDigits) {
      d.y += d.vy;
      if (d.y > H + 20) {
        d.y = -20;
        d.x = Math.random() * W;
      }
      d.phase += d.flickerSpeed;
      if (elapsed - d.lastSwap > d.nextSwap) {
        d.char = hexChar();
        d.lastSwap = elapsed;
        d.nextSwap = 1200 + Math.random() * 4000;
      }
      const wake = Math.min(1, elapsed / 1500);
      const flicker = 0.85 + Math.abs(Math.sin(d.phase)) * 0.3;
      const [dr, dg, db] = tweaks._digitRgb;
      ctx!.fillStyle = `rgba(${dr}, ${dg}, ${db}, ${tweaks.digitOpacity * flicker * wake})`;
      ctx!.fillText(d.char, d.x, d.y);
    }
  }

  /* ───────── EDGE PARTICLES ───────── */
  function initEdgeParticles() {
    edgeParticles.length = 0;
    for (let i = 0; i < edges.length; i++) {
      const count = Math.random() < 0.4 ? 2 : 1;
      for (let j = 0; j < count; j++) {
        edgeParticles.push({
          edgeIdx: i,
          t: Math.random(),
          direction: Math.random() < 0.5 ? 1 : -1,
          speed: 0.0014 + Math.random() * 0.0028,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }
  function drawEdgeParticles(elapsed: number) {
    ctx!.globalCompositeOperation = "multiply";
    for (const p of edgeParticles) {
      p.t += p.speed * p.direction;
      if (p.t > 1) p.t -= 1;
      if (p.t < 0) p.t += 1;
      const edge = edges[p.edgeIdx];
      const wa = wakeness(nodes[edge.from], elapsed);
      const wb = wakeness(nodes[edge.to], elapsed);
      const loA = nodes[edge.from].lifeOpacity ?? 1;
      const loB = nodes[edge.to].lifeOpacity ?? 1;
      const wake = Math.min(wa, wb, loA, loB);
      if (wake < 0.3) continue;
      const pos = edgePos(edge, p.t, 1);
      p.phase += 0.08;
      const alpha = (0.45 + Math.sin(p.phase) * 0.15) * wake;
      ctx!.fillStyle = `rgba(49, 70, 85, ${alpha})`;
      ctx!.beginPath();
      ctx!.arc(pos.x, pos.y, 0.95, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalCompositeOperation = "source-over";
  }

  /* ───────── PULSES ───────── */
  function spawnPulseAt(nodeIdx: number, heavy?: boolean) {
    if (typeof heavy === "undefined") heavy = Math.random() < 0.13;
    pulses.push({
      currentNode: nodeIdx,
      currentEdge: -1,
      direction: 1,
      t: 0,
      speed: heavy ? 0.00845 : 0.01267 + Math.random() * 0.00704,
      heavy,
      hue: heavy ? "amber" : "teal",
      trail: [],
      visited: new Set([nodeIdx]),
    });
    chooseNextEdge(pulses[pulses.length - 1]);
    activityImpulse = Math.min(28, activityImpulse + (heavy ? 5 : 2.5));
  }

  function chooseNextEdge(pulse: any) {
    const node = nodes[pulse.currentNode];
    if (!node || node.level === 0) {
      pulse.done = true;
      return;
    }
    if (node.routable === false) {
      pulse.done = true;
      return;
    }
    const neighbors = adjacency[pulse.currentNode];
    const better = neighbors
      .filter((n) => !pulse.visited.has(n.other))
      .filter((n) => nodes[n.other].routable !== false)
      .filter((n) => nodes[n.other].level <= node.level);
    const candidates = better.length
      ? better
      : neighbors
          .filter((n) => !pulse.visited.has(n.other))
          .filter((n) => nodes[n.other].routable !== false);
    if (candidates.length === 0) {
      pulse.done = true;
      return;
    }
    candidates.sort((a, b) => nodes[a.other].level - nodes[b.other].level);
    const picked =
      Math.random() < 0.72
        ? candidates[0]
        : candidates[Math.min(candidates.length - 1, (Math.random() * candidates.length) | 0)];
    pulse.currentEdge = picked.edgeIdx;
    const edge = edges[picked.edgeIdx];
    pulse.direction = edge.from === pulse.currentNode ? 1 : -1;
    pulse.t = 0;
    pulse.nextNode = picked.other;
    pulse.visited.add(picked.other);

    if (pulse.heavy && Math.random() < 0.25 && candidates.length > 1) {
      const alt = candidates[1];
      if (alt && alt.edgeIdx !== picked.edgeIdx) {
        pulses.push({
          currentNode: pulse.currentNode,
          currentEdge: alt.edgeIdx,
          direction: edges[alt.edgeIdx].from === pulse.currentNode ? 1 : -1,
          t: 0,
          speed: 0.00986 + Math.random() * 0.00563,
          heavy: false,
          hue: "teal",
          trail: [],
          visited: new Set([...pulse.visited]),
          nextNode: alt.other,
        });
      }
    }
  }

  function spawnFromOuter() {
    const candidates: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].level === 4 && nodes[i].routable !== false) candidates.push(i);
    }
    if (candidates.length === 0) return;
    spawnPulseAt(candidates[(Math.random() * candidates.length) | 0]);
  }

  /* ───────── CLICK = FIRE TO CORE ───────── */
  function fireToCore(px: number, py: number) {
    directFires.push({ sx: px, sy: py, life: 0, maxLife: 68, trail: [] });
    ripples.push({ x: px, y: py, life: 0, maxLife: 50, hue: "amber" });
    activityImpulse = Math.min(35, activityImpulse + 12);
  }

  function updateDirectFires(_elapsed: number) {
    const core = nodes[0];
    for (let i = directFires.length - 1; i >= 0; i--) {
      const f = directFires[i];
      f.life++;
      if (f.life > f.maxLife) {
        core.target = 1;
        ripples.push({ x: core.x, y: core.y, life: 0, maxLife: 70, hue: "amber" });
        ripples.push({ x: core.x, y: core.y, life: -10, maxLife: 90, hue: "amber" });
        activityImpulse = Math.min(45, activityImpulse + 11.2);
        for (let level = 1; level <= 4; level++) {
          safeSetTimeout(() => {
            for (const n of nodes) {
              if (n.level === level) n.target = Math.min(1, n.target + 0.4);
            }
            activityImpulse = Math.min(45, activityImpulse + 3.2);
          }, level * 200);
        }
        directFires.splice(i, 1);
        continue;
      }
      const t = f.life / f.maxLife;
      const eased = t * t;
      const x = f.sx + (core.x - f.sx) * eased;
      const y = f.sy + (core.y - f.sy) * eased;
      f.trail.push({ x, y });
      if (f.trail.length > 68) f.trail.shift();

      for (let j = 0; j < f.trail.length; j++) {
        const tr = f.trail[j];
        const a = (j / f.trail.length) * 0.85;
        const r = 0.3 + (j / f.trail.length) * 1.1;
        ctx!.fillStyle = `rgba(210, 216, 221, ${a})`;
        ctx!.beginPath();
        ctx!.arc(tr.x, tr.y, r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "screen";
      const grd = ctx!.createRadialGradient(x, y, 0, x, y, 7);
      grd.addColorStop(0, "rgba(210, 216, 221, 0.55)");
      grd.addColorStop(0.5, "rgba(210, 216, 221, 0.18)");
      grd.addColorStop(1, "rgba(210, 216, 221, 0)");
      ctx!.fillStyle = grd;
      ctx!.beginPath();
      ctx!.arc(x, y, 7, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = "rgba(238, 242, 246, 1)";
      ctx!.beginPath();
      ctx!.arc(x, y, 0.9, 0, Math.PI * 2);
      ctx!.fill();
    }
  }

  /* ───────── HEARTBEAT ───────── */
  let lastHeartbeat = 0;
  function maybeHeartbeat(elapsed: number) {
    if (elapsed < 3000) return;
    if (elapsed - lastHeartbeat > 9000 + Math.random() * 4000) {
      nodes[0].target = Math.min(1, nodes[0].target + 0.4);
      activityImpulse = Math.min(40, activityImpulse + 6.4);
      for (let level = 1; level <= 4; level++) {
        safeSetTimeout(() => {
          for (const n of nodes) {
            if (n.level === level) n.target = Math.min(1, n.target + 0.44);
          }
          activityImpulse = Math.min(40, activityImpulse + 3.2);
        }, level * 256);
      }
      lastHeartbeat = elapsed;
    }
  }

  /* ───────── GHOSTS ───────── */
  let lastGhost = 0;
  function maybeSpawnGhost(elapsed: number) {
    if (elapsed < 2000) return;
    if (elapsed - lastGhost > 2800 + Math.random() * 2500) {
      const candidates: number[] = [];
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].level === 4 && nodes[i].routable !== false) candidates.push(i);
      }
      if (candidates.length === 0) return;
      const targetIdx = candidates[(Math.random() * candidates.length) | 0];
      const target = nodes[targetIdx];
      const dx = target.x - CX;
      const dy = target.y - CY;
      const extend = 70 + Math.random() * 70;
      const jitter = (Math.random() - 0.5) * 0.4;
      const a = Math.atan2(dy, dx) + jitter;
      ghosts.push({
        sx: target.x + Math.cos(a) * extend,
        sy: target.y + Math.sin(a) * extend,
        targetIdx,
        life: 0,
        maxLife: 55 + Math.random() * 20,
        fired: false,
      });
      lastGhost = elapsed;
    }
  }
  function updateGhosts(_elapsed: number) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.life++;
      const target = nodes[g.targetIdx];
      if (!target) {
        ghosts.splice(i, 1);
        continue;
      }
      if (g.life >= g.maxLife) {
        if (!g.fired) {
          spawnPulseAt(g.targetIdx, false);
          target.target = Math.min(1, target.target + 0.28);
          g.fired = true;
        }
        ghosts.splice(i, 1);
        continue;
      }
      const t = g.life / g.maxLife;
      const x = g.sx + (target.x - g.sx) * t;
      const y = g.sy + (target.y - g.sy) * t;
      const alpha = (1 - Math.abs(t - 0.5) * 2) * 0.85;
      ctx!.globalCompositeOperation = "screen";
      const grd = ctx!.createRadialGradient(x, y, 0, x, y, 10);
      grd.addColorStop(0, `rgba(210, 216, 221, ${alpha * 0.55})`);
      grd.addColorStop(1, "rgba(210, 216, 221, 0)");
      ctx!.fillStyle = grd;
      ctx!.beginPath();
      ctx!.arc(x, y, 10, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = `rgba(238, 242, 246, ${alpha})`;
      ctx!.beginPath();
      ctx!.arc(x, y, 1.0, 0, Math.PI * 2);
      ctx!.fill();
    }
  }

  /* ───────── DRAWING ───────── */
  const COL = {
    tealGlow: (a: number) => `rgba(49, 70, 85, ${a})`,
    tealCore: (a: number) => `rgba(35, 52, 66, ${a})`,
    amberGlow: (a: number) => `rgba(22, 35, 48, ${a})`,
    amberCore: (a: number) => `rgba(13, 22, 32, ${a})`,
    line: (a: number) => `rgba(28, 42, 56, ${a})`,
  };

  function wakeness(node: any, elapsed: number) {
    return Math.min(1, Math.max(0, (elapsed - node.wakeAt) / 700));
  }

  function drawEdge(edge: any, wake: number) {
    const a = nodes[edge.from];
    const b = nodes[edge.to];
    const edgeLo = Math.min(a.lifeOpacity ?? 1, b.lifeOpacity ?? 1);
    if (edgeLo < 0.01) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    const mx = (a.x + b.x) / 2 + nx * edge.curveOffset;
    const my = (a.y + b.y) / 2 + ny * edge.curveOffset;
    const [er, eg, eb] = tweaks._edgeRgb;
    const baseAlpha = tweaks.edgeAlpha + edge.active * 0.5;
    ctx!.strokeStyle = `rgba(${er}, ${eg}, ${eb}, ${baseAlpha * wake * edgeLo})`;
    ctx!.lineWidth = tweaks.edgeThickness + edge.active * 0.9;
    ctx!.beginPath();
    ctx!.moveTo(a.x, a.y);
    ctx!.quadraticCurveTo(mx, my, b.x, b.y);
    ctx!.stroke();
  }

  function edgePos(edge: any, t: number, direction: number) {
    const a = nodes[edge.from];
    const b = nodes[edge.to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    const mx = (a.x + b.x) / 2 + nx * edge.curveOffset;
    const my = (a.y + b.y) / 2 + ny * edge.curveOffset;
    const u = direction === 1 ? t : 1 - t;
    const omu = 1 - u;
    return {
      x: omu * omu * a.x + 2 * omu * u * mx + u * u * b.x,
      y: omu * omu * a.y + 2 * omu * u * my + u * u * b.y,
    };
  }

  function drawNode(n: any) {
    const lo = n.lifeOpacity ?? 1;
    if (lo < 0.01) return;
    const glow = n.glow * lo;
    if (glow < 0.015) return;
    const isAmber = n.hue === "amber";
    const halo = isAmber ? COL.amberGlow : COL.tealGlow;
    const core = isAmber ? COL.amberCore : COL.tealCore;

    const haloR = 4 + glow * (isAmber ? 28 : 18);
    ctx!.globalCompositeOperation = "multiply";
    const grd = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloR);
    grd.addColorStop(0, halo(glow * (isAmber ? 0.55 : 0.45)));
    grd.addColorStop(1, halo(0));
    ctx!.fillStyle = grd;
    ctx!.beginPath();
    ctx!.arc(n.x, n.y, haloR, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.globalCompositeOperation = "source-over";

    ctx!.fillStyle = core(0.92 * Math.min(1, glow * 1.4 + 0.32));
    ctx!.strokeStyle = core(0.7);
    ctx!.lineWidth = 0.8;

    const size = n.size;
    ctx!.beginPath();
    switch (n.shape) {
      case "hex":
      case "core": {
        const r = n.size;
        for (let k = 0; k < 6; k++) {
          const ang = (Math.PI / 3) * k - Math.PI / 2;
          const px = n.x + Math.cos(ang) * r;
          const py = n.y + Math.sin(ang) * r;
          if (k === 0) ctx!.moveTo(px, py);
          else ctx!.lineTo(px, py);
        }
        ctx!.closePath();
        break;
      }
      case "circle":
        ctx!.arc(n.x, n.y, size, 0, Math.PI * 2);
        break;
      case "diamond":
        ctx!.moveTo(n.x, n.y - size);
        ctx!.lineTo(n.x + size, n.y);
        ctx!.lineTo(n.x, n.y + size);
        ctx!.lineTo(n.x - size, n.y);
        ctx!.closePath();
        break;
      case "square":
        ctx!.rect(n.x - size, n.y - size, size * 2, size * 2);
        break;
      case "triangle":
        ctx!.moveTo(n.x, n.y - size);
        ctx!.lineTo(n.x + size * 0.866, n.y + size * 0.5);
        ctx!.lineTo(n.x - size * 0.866, n.y + size * 0.5);
        ctx!.closePath();
        break;
    }
    ctx!.fill();
    ctx!.stroke();
  }

  function drawPulse(p: any) {
    if (p.currentEdge < 0) return;
    const edge = edges[p.currentEdge];
    const pos = edgePos(edge, p.t, p.direction);
    p.trail.push({ x: pos.x, y: pos.y });
    if (p.trail.length > 64) p.trail.shift();
    const [tr0, tg0, tb0] = tweaks._tracerRgb;
    const tracer = (a: number) => `rgba(${tr0}, ${tg0}, ${tb0}, ${a})`;
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i];
      const a = (i / p.trail.length) * 0.85;
      const r = 0.3 + (i / p.trail.length) * (p.heavy ? 1.2 : 0.85);
      ctx!.fillStyle = tracer(a);
      ctx!.beginPath();
      ctx!.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalCompositeOperation = "screen";
    const headHaloR = p.heavy ? 5 : 3.5;
    const grd = ctx!.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, headHaloR);
    grd.addColorStop(0, "rgba(210, 216, 221, 0.55)");
    grd.addColorStop(0.5, "rgba(210, 216, 221, 0.20)");
    grd.addColorStop(1, "rgba(210, 216, 221, 0)");
    ctx!.fillStyle = grd;
    ctx!.beginPath();
    ctx!.arc(pos.x, pos.y, headHaloR, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.globalCompositeOperation = "source-over";
    ctx!.fillStyle = "rgba(238, 242, 246, 1)";
    ctx!.beginPath();
    ctx!.arc(pos.x, pos.y, p.heavy ? 0.8 : 0.55, 0, Math.PI * 2);
    ctx!.fill();
  }

  function drawRipple(r: any) {
    const lt = Math.max(0, r.life / r.maxLife);
    const radius = 8 + lt * 60;
    const alpha = Math.max(0, (1 - lt) * 0.55);
    const glow = r.hue === "amber" ? COL.amberGlow : COL.tealGlow;
    ctx!.strokeStyle = glow(alpha);
    ctx!.lineWidth = 1;
    ctx!.beginPath();
    ctx!.arc(r.x, r.y, radius, 0, Math.PI * 2);
    ctx!.stroke();
  }

  /* ───────── LIVE SIGNAL FEED ───────── */
  function hex(n: number) {
    let s = "";
    for (let i = 0; i < n; i++) s += "0123456789abcdef"[(Math.random() * 16) | 0];
    return s;
  }
  function rand4() {
    return String((Math.random() * 9999) | 0).padStart(4, "0");
  }
  function pad3(n: number) {
    return String(n).padStart(3, "0");
  }
  function randIP() {
    return `${(Math.random() * 240 + 10) | 0}.${pad3((Math.random() * 255) | 0)}.x.${
      (Math.random() * 255) | 0
    }`;
  }
  function pick<T>(arr: T[]): T {
    return arr[(Math.random() * arr.length) | 0];
  }

  const STATUS = ["200", "200", "200", "201", "204", "304", "202"];
  const VERBS = ["GET", "GET", "GET", "HEAD", "POST", "FETCH"];

  const TEMPLATES: Array<() => string> = [
    () =>
      `<span class="sym">›</span><span class="dim">${pick(VERBS)}</span> /sig/0x<span class="hex">${hex(8)}</span> → <span class="ink">${pick(
        STATUS,
      )}</span> <span class="dim">${((Math.random() * 120 + 8) | 0)}ms</span>`,
    () =>
      `<span class="sym">·</span><span class="hex">0x${hex(10)}</span> <span class="dim">+0.${pad3(
        (Math.random() * 99) | 0,
      )}s</span>`,
    () =>
      `<span class="sym">·</span><span class="dim">TCP::open(</span>${randIP()}<span class="dim">:${
        (Math.random() * 9000 + 1024) | 0
      })</span>`,
    () =>
      `<span class="sym">·</span>resolve(0x<span class="hex">${hex(4)}</span>) → <span class="dim">${(
        Math.random() * 12 +
        0.4
      ).toFixed(1)}kb</span>`,
    () => `<span class="sym">·</span><span class="dim">sha256:</span> <span class="hex">${hex(14)}</span>`,
    () =>
      `<span class="sym">·</span><span class="dim">fetch(</span>"unicron://sig/0x<span class="hex">${hex(
        6,
      )}</span>"<span class="dim">)</span>`,
    () =>
      `<span class="sym">›</span>ref[<span class="hex">0x${hex(4)}</span>] → <span class="hex">0x${hex(
        4,
      )}</span>`,
    () =>
      `<span class="sym">·</span><span class="dim">conn</span> ${randIP()}:443 → <span class="ink">${pick(
        STATUS,
      )}</span>`,
    () =>
      `<span class="sym">›</span><span class="dim">Signal::new(</span>0x<span class="hex">${hex(
        6,
      )}</span><span class="dim">)</span>`,
    () => `<span class="sym">·</span>cache[<span class="hex">0x${hex(4)}</span>] → <span class="ink">HIT</span>`,
    () =>
      `<span class="sym">·</span>merge(<span class="dim">buf,</span> 0x<span class="hex">${hex(
        3,
      )}</span>) → <span class="ink">0</span>`,
    () =>
      `<span class="sym">›</span><span class="dim">GET</span> cdn.x.io/0x<span class="hex">${hex(
        6,
      )}</span> → <span class="ink">${pick(STATUS)}</span>`,
    () =>
      `<span class="sym">·</span>proc(0x<span class="hex">${rand4()}</span>) <span class="dim">+0.${pad3(
        (Math.random() * 99) | 0,
      )}s</span>`,
    () => `<span class="sym">›</span>queue.push(0x<span class="hex">${hex(4)}</span>)`,
    () =>
      `<span class="sym">·</span><span class="dim">mutex::lock(</span>0x<span class="hex">${hex(
        4,
      )}</span><span class="dim">)</span>`,
    () => `<span class="sym">·</span>buf[<span class="hex">${rand4()}</span>] = 0x<span class="hex">${hex(2)}</span>`,
  ];

  const HOT_TEMPLATES: Array<() => string> = [
    () =>
      `<span class="sym amb">►</span><span class="amb">ESC</span> → <span class="dim">core</span> <span class="hex">(+0.${pad3(
        (Math.random() * 99) | 0,
      )}s)</span>`,
    () =>
      `<span class="sym amb">►</span>ingest(0x<span class="hex">${rand4()}</span>) → <span class="amb">Ok</span>`,
    () =>
      `<span class="sym amb">►</span><span class="amb">fan_out</span>(<span class="hex">${(Math.random() * 4 + 1) | 0}</span>)`,
    () => `<span class="sym amb">►</span>reflex<span class="amb">::trigger()</span>`,
    () =>
      `<span class="sym amb">►</span>inference[0x<span class="hex">${hex(4)}</span>] <span class="amb">resolved</span> → <span class="hex">0.${pad3(
        800 + ((Math.random() * 199) | 0),
      )}</span>`,
    () =>
      `<span class="sym amb">►</span><span class="amb">confidence</span> ↑ accept(0x<span class="hex">${hex(4)}</span>)`,
  ];

  const INTEL_TEMPLATES: Array<() => string> = [
    () => `<span class="sym">›</span>infer(0x<span class="hex">${hex(6)}</span>) → 0x<span class="hex">${hex(4)}</span>`,
    () =>
      `<span class="sym">·</span>predict[0x<span class="hex">${hex(4)}</span>] <span class="dim">conf</span> <span class="ink">0.${pad3(
        700 + ((Math.random() * 299) | 0),
      )}</span>`,
    () =>
      `<span class="sym">·</span>match(0x<span class="hex">${hex(4)}</span>) → 0x<span class="hex">${hex(
        4,
      )}</span> <span class="dim">(0.${pad3(800 + ((Math.random() * 199) | 0))})</span>`,
    () =>
      `<span class="sym">·</span>recall(0x<span class="hex">${hex(4)}</span>) → <span class="dim">ref:</span>0x<span class="hex">${hex(
        4,
      )}</span>`,
    () =>
      `<span class="sym">›</span>weights.update(<span class="hex">+0.0${pad3((Math.random() * 99) | 0)}</span>)`,
    () =>
      `<span class="sym">·</span>attn[0x<span class="hex">${hex(
        4,
      )}</span>] <span class="amb">↑</span> <span class="ink">0.${pad3((Math.random() * 999) | 0)}</span>`,
    () =>
      `<span class="sym">·</span><span class="dim">posterior(</span>0x<span class="hex">${hex(
        4,
      )}</span><span class="dim">) =</span> <span class="ink">0.${pad3(
        600 + ((Math.random() * 399) | 0),
      )}</span>`,
    () =>
      `<span class="sym">›</span>delta(<span class="dim">pred, obs</span>) = <span class="hex">±0.0${pad3(
        (Math.random() * 99) | 0,
      )}</span>`,
    () =>
      `<span class="sym">·</span>score(0x<span class="hex">${hex(3)}</span>, 0x<span class="hex">${hex(
        3,
      )}</span>) = <span class="ink">0.${pad3((Math.random() * 999) | 0)}</span>`,
    () => `<span class="sym">·</span>cluster_id[0x<span class="hex">${hex(4)}</span>] = <span class="hex">0x${hex(2)}</span>`,
    () => `<span class="sym">·</span>embed(0x<span class="hex">${hex(4)}</span>) → <span class="dim">[768]</span>`,
    () =>
      `<span class="sym">·</span>loss = <span class="hex">0.0${pad3((Math.random() * 99) | 0)}</span> <span class="dim">(Δ -0.0${pad3(
        (Math.random() * 99) | 0,
      )})</span>`,
    () =>
      `<span class="sym">›</span>selfcheck::coherence → <span class="ink">0.${pad3(900 + ((Math.random() * 99) | 0))}</span>`,
    () =>
      `<span class="sym">·</span>compare(0x<span class="hex">${hex(3)}</span>, 0x<span class="hex">${hex(
        3,
      )}</span>) → <span class="dim">Δ</span> <span class="hex">0.0${pad3((Math.random() * 99) | 0)}</span>`,
    () =>
      `<span class="sym">›</span>bayes_update(<span class="dim">prior=</span><span class="hex">0.${pad3(
        (Math.random() * 999) | 0,
      )}</span>)`,
    () =>
      `<span class="sym">·</span>rank[0x<span class="hex">${hex(4)}</span>] #<span class="ink">${
        (Math.random() * 9 + 1) | 0
      }</span> <span class="dim">/ 14</span>`,
  ];

  const EASTER: Array<() => string> = [
    () => `<span class="sym">·</span><span class="dim">// here be dragons</span>`,
    () => `<span class="sym">·</span><span class="dim">assert(reality)</span>`,
    () => `<span class="sym">·</span><span class="dim">404 · meaning_not_found</span>`,
    () =>
      `<span class="sym">·</span>entropy: <span class="hex">${(Math.random() * 9 + 0.5).toFixed(
        3,
      )}</span> <span class="dim">rising</span>`,
    () => `<span class="sym">·</span>kernel: <span class="dim">panic averted</span>`,
    () => `<span class="sym">·</span><span class="dim">EAGAIN · try later</span>`,
    () => `<span class="sym">·</span>chmod <span class="hex">000</span> <span class="dim">doubt</span>`,
    () => `<span class="sym">·</span><span class="dim">/dev/null · /dev/zen</span>`,
    () => `<span class="sym">·</span><span class="dim">recursion → see recursion</span>`,
    () => `<span class="sym">·</span>uptime: <span class="hex">∞</span>`,
  ];

  function generateFeedLine(hot: boolean) {
    if (hot && Math.random() < 0.65) return pick(HOT_TEMPLATES)();
    if (Math.random() < 0.04) return pick(EASTER)();
    if (Math.random() < 0.45) return pick(INTEL_TEMPLATES)();
    return pick(TEMPLATES)();
  }

  function pushFeedLine(html: string) {
    const line = document.createElement("div");
    line.className = "feed-line";
    line.innerHTML = html;
    feedInner.appendChild(line);
    feedLines.push(line);
    while (feedLines.length > MAX_FEED_LINES) {
      const removed = feedLines.shift();
      removed?.remove();
    }
    for (let i = 0; i < feedLines.length; i++) {
      const dist = feedLines.length - 1 - i;
      const op = Math.max(0.16, 0.95 - dist * 0.14);
      feedLines[i].style.opacity = op.toFixed(2);
    }
  }

  let lastFeed = 0;
  let nextFeedDelay = 55;
  function updateFeed(elapsed: number) {
    if (elapsed - lastFeed < nextFeedDelay) return;
    lastFeed = elapsed;
    const a = Math.min(1, activityImpulse / 22);
    nextFeedDelay = 55 + (1 - a) * 119 + Math.random() * 83;
    const hot = a > 0.45;
    pushFeedLine(generateFeedLine(hot));
    activityImpulse = Math.max(0, activityImpulse - 0.6);
  }

  /* ───────── MAIN LOOP ───────── */
  let lastSpawn = 0;
  let breathPhase = 0;

  function tick(now: number) {
    if (stopped) return;
    const elapsed = now - startTime;

    breathPhase += 0.003;
    const breath = Math.sin(breathPhase) * 0.018 + 1;
    // Position update: ephemeral nodes grow from their PARENT's current
    // position, not from the honeycomb center, so growth chains outward.
    for (const n of nodes) {
      const driftX = Math.sin(elapsed * n.driftSpeedX + n.driftPhaseX) * n.driftAmp;
      const driftY = Math.cos(elapsed * n.driftSpeedY + n.driftPhaseY) * n.driftAmp;
      const finalX = CX + n.rx * breath + driftX;
      const finalY = CY + n.ry * breath + driftY;
      const g = n.growProgress ?? 1;
      if (g >= 1 || n.parent < 0) {
        n.x = finalX;
        n.y = finalY;
      } else {
        const p = nodes[n.parent];
        n.x = p.x + (finalX - p.x) * g;
        n.y = p.y + (finalY - p.y) * g;
      }
    }

    ctx!.clearRect(0, 0, W, H);
    drawHex(elapsed);

    for (const edge of edges) {
      const wa = wakeness(nodes[edge.from], elapsed);
      const wb = wakeness(nodes[edge.to], elapsed);
      const wake = Math.min(wa, wb);
      if (wake < 0.05) continue;
      drawEdge(edge, wake);
      edge.active *= 0.93;
    }

    drawEdgeParticles(elapsed);

    if (elapsed > 1100 && now - lastSpawn > 341 - Math.random() * 171) {
      spawnFromOuter();
      if (Math.random() < 0.28) safeSetTimeout(spawnFromOuter, 142 + Math.random() * 255);
      lastSpawn = now;
    }

    maybeHeartbeat(elapsed);
    maybeSpawnGhost(elapsed);
    updateEphemeralArms(elapsed);

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      if (p.done) {
        pulses.splice(i, 1);
        continue;
      }
      p.t += p.speed;
      if (p.t >= 1) {
        const edge = edges[p.currentEdge];
        edge.active = Math.min(1, edge.active + 0.7);
        const arrived = p.nextNode;
        const arrivedNode = nodes[arrived];
        arrivedNode.target = Math.min(1, arrivedNode.target + (p.heavy ? 0.624 : 0.36));
        activityImpulse = Math.min(40, activityImpulse + (p.heavy ? 1.76 : 0.96));
        p.currentNode = arrived;
        if (arrivedNode.level === 0) {
          arrivedNode.target = Math.min(1, arrivedNode.target + 0.32);
          activityImpulse = Math.min(42, activityImpulse + 4.8);
          p.done = true;
          continue;
        }
        chooseNextEdge(p);
        if (p.done) continue;
      }
      drawPulse(p);
    }

    updateDirectFires(elapsed);
    updateGhosts(elapsed);

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.life++;
      if (r.life > r.maxLife) {
        ripples.splice(i, 1);
        continue;
      }
      drawRipple(r);
    }

    for (const n of nodes) {
      const wake = wakeness(n, elapsed);
      const layerBase = n.baseGlow * wake;
      n.phase += 0.04 * n.flicker;
      const flick = 1 + Math.sin(n.phase) * 0.06;

      let cursorBoost = 0;
      if (cursor.active) {
        const dx = n.x - cursor.x,
          dy = n.y - cursor.y;
        const d2 = dx * dx + dy * dy;
        const R = 100;
        if (d2 < R * R) cursorBoost = (1 - Math.sqrt(d2) / R) * 0.4;
      }

      n.target = layerBase + cursorBoost + (n.target - layerBase - cursorBoost) * 0.93;
      n.glow += (n.target - n.glow) * 0.16;
      drawNode({ ...n, glow: n.glow * flick });
    }

    updateFeed(elapsed);
    rafId = requestAnimationFrame(tick);
  }

  /* ───────── INPUT ───────── */
  canvas.addEventListener(
    "mousemove",
    (e) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
      cursor.active = true;
    },
    { signal: abort.signal },
  );
  canvas.addEventListener("mouseleave", () => {
    cursor.active = false;
  }, { signal: abort.signal });
  canvas.addEventListener(
    "click",
    (e) => {
      fireToCore(e.clientX, e.clientY);
    },
    { signal: abort.signal },
  );

  window.addEventListener("resize", () => resize(), { signal: abort.signal });
  resize();
  rafId = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
    for (const t of pendingTimers) clearTimeout(t);
    pendingTimers.clear();
    abort.abort();
    // Drain feed children so HMR re-mounts don't double-stack.
    while (feedInner.firstChild) feedInner.removeChild(feedInner.firstChild);
  };
}
