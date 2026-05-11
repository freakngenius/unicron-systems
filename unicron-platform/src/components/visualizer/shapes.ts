import type { Shape } from './types';

export const PI2 = Math.PI * 2;

export const rand = (a: number, b: number) => Math.random() * (b - a) + a;
export const randInt = (a: number, b: number) =>
  Math.floor(Math.random() * (b - a + 1)) + a;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, mn: number, mx: number) =>
  Math.max(mn, Math.min(mx, v));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export type RGB = { r: number; g: number; b: number };

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToCss(c: RGB, a = 1) {
  return `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${a})`;
}

export function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

export function angularDist(a: number, b: number) {
  let d = Math.abs(a - b) % PI2;
  if (d > Math.PI) d = PI2 - d;
  return d;
}

export function pickWeighted<T extends string>(weights: Record<T, number>): T {
  const keys = Object.keys(weights) as T[];
  if (keys.length === 0) throw new Error('pickWeighted: empty');
  const total = keys.reduce((acc, k) => acc + weights[k], 0);
  if (total <= 0) return keys[0];
  let r = Math.random() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

export function pathByShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  size: number,
) {
  ctx.beginPath();
  if (shape === 'diamond') {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    return;
  }
  const sides = shape === 'hexagon' ? 6 : 8;
  for (let i = 0; i < sides; i++) {
    const a = (i * PI2) / sides - Math.PI / 2;
    const px = x + Math.cos(a) * size;
    const py = y + Math.sin(a) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function getShapePoints(shape: Shape, x: number, y: number, size: number) {
  const pts: [number, number][] = [];
  if (shape === 'diamond') {
    pts.push([x, y - size]);
    pts.push([x + size, y]);
    pts.push([x, y + size]);
    pts.push([x - size, y]);
    return pts;
  }
  const sides = shape === 'hexagon' ? 6 : 8;
  for (let i = 0; i < sides; i++) {
    const a = (i * PI2) / sides - Math.PI / 2;
    pts.push([x + Math.cos(a) * size, y + Math.sin(a) * size]);
  }
  return pts;
}

export function strokeShapePartial(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  size: number,
  progress: number,
  color: string,
  lineWidth: number,
) {
  if (progress <= 0) return;
  const pts = getShapePoints(shape, x, y, size);
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    const [nx, ny] = pts[(i + 1) % pts.length];
    const len = Math.hypot(nx - px, ny - py);
    segLengths.push(len);
    total += len;
  }
  const want = total * clamp(progress, 0, 1);
  let cumulative = 0;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    const [nx, ny] = pts[(i + 1) % pts.length];
    const segLen = segLengths[i];
    if (cumulative + segLen <= want) {
      ctx.lineTo(nx, ny);
      cumulative += segLen;
    } else {
      const remaining = want - cumulative;
      const t = remaining / Math.max(1e-6, segLen);
      ctx.lineTo(px + (nx - px) * t, py + (ny - py) * t);
      break;
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** Tiny inline 2D simplex noise so we don't depend on simplex-noise's CJS shim. */
export function makeNoise2D() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad3 = new Float32Array([
    1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1,
  ]);
  const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
  return function noise2D(xin: number, yin: number) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t,
      Y0 = j - t;
    const x0 = xin - X0,
      y0 = yin - Y0;
    let i1: number, j1: number;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2,
      y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2,
      y2 = y0 - 1.0 + 2.0 * G2;
    const ii = i & 255,
      jj = j & 255;
    const gi0 = (perm[ii + perm[jj]] % 12) * 2;
    const gi1 = (perm[ii + i1 + perm[jj + j1]] % 12) * 2;
    const gi2 = (perm[ii + 1 + perm[jj + 1]] % 12) * 2;
    let n0 = 0,
      n1 = 0,
      n2 = 0;
    let tt = 0.5 - x0 * x0 - y0 * y0;
    if (tt > 0) {
      tt *= tt;
      n0 = tt * tt * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0);
    }
    tt = 0.5 - x1 * x1 - y1 * y1;
    if (tt > 0) {
      tt *= tt;
      n1 = tt * tt * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);
    }
    tt = 0.5 - x2 * x2 - y2 * y2;
    if (tt > 0) {
      tt *= tt;
      n2 = tt * tt * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);
    }
    return 70.0 * (n0 + n1 + n2);
  };
}

/**
 * Color palette per layer / index — used to assign distinct colors for new agents.
 *
 * Atrium token mapping (Pass 2 of the rebrand):
 *   layer 2 (sources)    → research / operations / info family (cool blues + teal)
 *   layer 3 (watchers)   → discovery / warn family (warm gold)
 *   layer 4 (drafters)   → err / sales family (warm red/orange)
 *
 * Canvas 2D requires resolved color strings (var() not supported as fillStyle),
 * so we resolve at module load time via getComputedStyle and fall back to
 * baked-in hex equivalents of the canonical tokens for SSR / tests.
 */
function resolveToken(token: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v || fallback;
}

const LAYER2_TOKENS: ReadonlyArray<[string, string]> = [
  ['--cat-research', '#6F95D6'],
  ['--info', '#6F95D6'],
  ['--cat-operations', '#5BB5BC'],
];
const LAYER3_TOKENS: ReadonlyArray<[string, string]> = [
  ['--cat-discovery', '#D9A23A'],
  ['--warn', '#D9A23A'],
];
const LAYER4_TOKENS: ReadonlyArray<[string, string]> = [
  ['--err', '#DD6262'],
  ['--cat-sales', '#E8763A'],
];

export const LAYER_PALETTE: Record<2 | 3 | 4, string[]> = {
  2: LAYER2_TOKENS.map(([t, f]) => resolveToken(t, f)),
  3: LAYER3_TOKENS.map(([t, f]) => resolveToken(t, f)),
  4: LAYER4_TOKENS.map(([t, f]) => resolveToken(t, f)),
};

export const LAYER_SHAPE: Record<2 | 3 | 4, Shape> = {
  2: 'hexagon',
  3: 'diamond',
  4: 'octagon',
};
