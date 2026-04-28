// agent-tints.ts — agent → color helper.
//
// Per the Computer-As-Engine design feedback, only two agents get a hue:
//   - Ingestor → `hi` cyan   (#22d3ee)
//   - Ranker   → `warm` lime (#a3e635)
//   - Adjacent stays mono ink (#0a0a0a) — distinguished by tagging only,
//     so we don't invent a third hue.
//
// Used by the activity rail (line prefix tint), agent status row (cell
// pulse + name color), and any future surface that wants per-agent color.

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

export interface AgentMeta {
  id: AgentName;
  label: string;
  /** null for Adjacent — mono ink, no hue. */
  tintKey: 'hi' | 'warm' | null;
}

export const AGENTS: Record<AgentName, AgentMeta> = {
  ingestor: { id: 'ingestor', label: 'INGESTOR', tintKey: 'hi' },
  ranker: { id: 'ranker', label: 'RANKER', tintKey: 'warm' },
  adjacent: { id: 'adjacent', label: 'ADJACENT', tintKey: null },
};

/**
 * Returns the hex color for an agent's name in chrome contexts (white panels).
 * - ingestor → hi cyan
 * - ranker   → warm lime
 * - adjacent → mono ink #0a0a0a (no hue)
 * - unknown  → inkDim
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
 * `agentTint` for *map* contexts (deep slate background) — adjacent uses
 * the bright mapInk so it stays legible against the dark map.
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
