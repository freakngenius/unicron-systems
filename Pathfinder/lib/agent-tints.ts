// agent-tints.ts — agent → color helper.
//
// The dashboard's tint palette is a hard constraint: only three base hues
// (`hi` cyan, `warm` lime, `ink` mono) plus alpha variations. To distinguish
// the 8-agent fleet (plus `eval`) without inventing new colors, every agent
// resolves to one of those three base hues and optionally carries a render
// `modifier` describing how the consumer should treat it (ring, soft fill,
// dim, italic, bold, mono prefix). The base resolver — `agentTint` and
// `agentTintOnMap` — still returns one of the 3 hues; the `modifier` field
// is metadata for surfaces that want to layer additional weight or texture
// on top.
//
// Tint mapping is documented in docs/PLAN-AGENTS.md §4.1; modifier names
// match that table verbatim so reviewers can cross-check.

import type { AgentName } from '@/lib/types';

export const PF_TINTS = {
  hi: '#22d3ee',
  hiSoft: 'rgba(34,211,238,0.14)',
  hiRing: 'rgba(34,211,238,0.45)',
  warm: '#a3e635',
  warmSoft: 'rgba(163,230,53,0.16)',
  warmRing: 'rgba(163,230,53,0.45)',
  ink: '#0a0a0a',
  inkSub: '#3a3f46',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  mapBg: '#0e1116',
  mapInk: '#e6e9ef',
  mapInkDim: '#9aa3b2',
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ruleSoft: 'rgba(10,10,10,0.12)',
  ruleHair: 'rgba(10,10,10,0.06)',
  sans: '"Inter", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  shadow: {
    sm: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
    md: '0 4px 12px rgba(10,10,10,0.08), 0 0 0 1px rgba(10,10,10,0.06)',
    lg: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
  },
  r: { sm: 3, md: 5, lg: 8 },
} as const;

/**
 * Render-strategy modifier for an agent. Resolves on top of the base hue
 * (`hi` / `warm` / `ink`). Consumers may ignore the modifier — the base
 * tint is always usable on its own.
 *
 *  - `ringOnly`   — outline ring around mono text (paired generators)
 *  - `softFill`   — low-alpha fill, ink text (downstream of a generator)
 *  - `dim`        — desaturated/lower contrast variant
 *  - `dimItalic`  — dim + italic, signals a "background" agent
 *  - `bold`       — heavier weight, signals synthesis importance
 *  - `mono`       — monospace tag prefix, signals system-meta
 */
export type AgentTintModifier =
  | 'ringOnly'
  | 'softFill'
  | 'dim'
  | 'dimItalic'
  | 'bold'
  | 'mono';

export interface AgentMeta {
  id: AgentName;
  label: string;
  /** null for agents that read as mono ink. */
  tintKey: 'hi' | 'warm' | null;
  /** Optional render strategy on top of the base hue. */
  modifier?: AgentTintModifier;
}

// Tint table — see docs/PLAN-AGENTS.md §4.1.
//
// | Agent          | tintKey | modifier     | render strategy                                |
// |----------------|---------|--------------|------------------------------------------------|
// | ingestor       | hi      | —            | solid cyan (existing)                          |
// | ranker         | warm    | —            | solid lime (existing)                          |
// | adjacent       | null    | —            | mono ink (existing)                            |
// | verifier       | warm    | ringOnly     | lime ring around mono — paired with Ranker     |
// | outreach       | hi      | softFill     | cyan-soft fill, ink text — downstream of Ranker|
// | pulse          | null    | dimItalic    | mono ink, italic, dim — system-tuning agent    |
// | competitive    | hi      | dim          | cyan-dim — research agent like Ingestor        |
// | briefing       | null    | bold         | mono ink, bold — synthesis agent               |
// | customer-intel | warm    | dim          | lime-dim — pipeline-adjacent like Ranker       |
// | eval           | null    | mono         | mono ink, monospace tag prefix `[eval]`        |
export const AGENTS: Record<AgentName, AgentMeta> = {
  ingestor: { id: 'ingestor', label: 'INGESTOR', tintKey: 'hi' },
  ranker: { id: 'ranker', label: 'RANKER', tintKey: 'warm' },
  adjacent: { id: 'adjacent', label: 'ADJACENT', tintKey: null },
  verifier: { id: 'verifier', label: 'VERIFIER', tintKey: 'warm', modifier: 'ringOnly' },
  outreach: { id: 'outreach', label: 'OUTREACH', tintKey: 'hi', modifier: 'softFill' },
  pulse: { id: 'pulse', label: 'PULSE', tintKey: null, modifier: 'dimItalic' },
  competitive: { id: 'competitive', label: 'COMPETITIVE', tintKey: 'hi', modifier: 'dim' },
  briefing: { id: 'briefing', label: 'BRIEFING', tintKey: null, modifier: 'bold' },
  'customer-intel': {
    id: 'customer-intel',
    label: 'CUSTOMER-INTEL',
    tintKey: 'warm',
    modifier: 'dim',
  },
  eval: { id: 'eval', label: 'EVAL', tintKey: null, modifier: 'mono' },
};

/**
 * Returns the hex color for an agent's name in chrome contexts (white panels).
 * Always resolves to one of the three base hues — modifiers are advisory and
 * should be read by callers from `AGENTS[name].modifier`.
 */
export function agentTint(name: AgentName | string | null | undefined): string {
  if (!name) return PF_TINTS.inkDim;
  const ag = AGENTS[name as AgentName];
  if (!ag) return PF_TINTS.inkDim;
  if (ag.tintKey === 'hi') return PF_TINTS.hi;
  if (ag.tintKey === 'warm') return PF_TINTS.warm;
  return PF_TINTS.ink;
}

/**
 * `agentTint` for *map* contexts (deep slate background) — null-tint agents
 * use the bright mapInk so they stay legible against the dark map.
 */
export function agentTintOnMap(name: AgentName | string | null | undefined): string {
  if (!name) return PF_TINTS.mapInkDim;
  const ag = AGENTS[name as AgentName];
  if (!ag) return PF_TINTS.mapInkDim;
  if (ag.tintKey === 'hi') return PF_TINTS.hi;
  if (ag.tintKey === 'warm') return PF_TINTS.warm;
  return PF_TINTS.mapInk;
}

/** Small utility — `hexAlpha('#22d3ee', 0.14)` → `rgba(34,211,238,0.14)`. */
export function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
