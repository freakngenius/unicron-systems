'use client';

// Tooltip — operator-grade hover/focus glossary tooltip.
//
// Wraps a child element and renders a positioned dark bubble on hover or
// keyboard focus. CSS-only fade (120ms) — no JS state, no portals.
//
// Visual contract:
//   - Small (12px tight sans), dark surface #1B2230, hairline border
//   - Arrow tail pointing toward the host
//   - Default placement: 'top' (above the host with a 6px gap)
//   - Other placements: 'right' | 'bottom' | 'left'
//   - No rounded marketing bubble; matches the dashboard's instrument aesthetic
//
// Usage:
//   <Tooltip text="Distance from this project to the nearest Zedcor branch.">
//     <span className="pf-label">Distance</span>
//   </Tooltip>

import * as React from 'react';

type Placement = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  text: string;
  placement?: Placement;
  /** Max width in px. Tooltips are glossary entries, not paragraphs — keep
   *  copy short. Defaults to 240. */
  maxWidth?: number;
  children: React.ReactNode;
  /** Optional className for the host span (e.g. to override display). */
  className?: string;
}

// Inject the CSS once on first render. Same pattern as `pf-spin-kf` in TopBar.
function ensureTooltipStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('pf-tooltip-styles')) return;
  const s = document.createElement('style');
  s.id = 'pf-tooltip-styles';
  s.textContent = `
    .pf-tt-host { position: relative; display: inline-flex; align-items: baseline; }
    .pf-tt-bubble {
      position: absolute;
      z-index: 60;
      background: #1B2230;
      color: #E6E9EF;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 6px 18px rgba(10,10,10,0.32);
      padding: 7px 10px;
      font: 500 11.5px/1.45 var(--font-inter), system-ui, sans-serif;
      letter-spacing: 0;
      text-transform: none;
      white-space: normal;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease;
      border-radius: 3px;
    }
    .pf-tt-bubble::after {
      content: '';
      position: absolute;
      width: 6px;
      height: 6px;
      background: #1B2230;
      border: 1px solid rgba(255,255,255,0.08);
      transform: rotate(45deg);
    }
    /* placements */
    .pf-tt-bubble.pf-tt-top    { left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); }
    .pf-tt-bubble.pf-tt-top::after    { left: 50%; bottom: -4px; margin-left: -3px; border-top: none; border-left: none; }
    .pf-tt-bubble.pf-tt-bottom { left: 50%; top: calc(100% + 6px); transform: translateX(-50%); }
    .pf-tt-bubble.pf-tt-bottom::after { left: 50%; top: -4px; margin-left: -3px; border-bottom: none; border-right: none; }
    .pf-tt-bubble.pf-tt-right  { top: 50%; left: calc(100% + 6px); transform: translateY(-50%); }
    .pf-tt-bubble.pf-tt-right::after  { top: 50%; left: -4px; margin-top: -3px; border-top: none; border-right: none; }
    .pf-tt-bubble.pf-tt-left   { top: 50%; right: calc(100% + 6px); transform: translateY(-50%); }
    .pf-tt-bubble.pf-tt-left::after   { top: 50%; right: -4px; margin-top: -3px; border-bottom: none; border-left: none; }
    /* show on hover or keyboard focus of the host or any descendant */
    .pf-tt-host:hover > .pf-tt-bubble,
    .pf-tt-host:focus-within > .pf-tt-bubble { opacity: 1; }
  `;
  document.head.appendChild(s);
}

export function Tooltip({ text, placement = 'top', maxWidth = 240, children, className }: TooltipProps) {
  ensureTooltipStyles();
  return (
    <span className={`pf-tt-host ${className ?? ''}`}>
      {children}
      <span className={`pf-tt-bubble pf-tt-${placement}`} role="tooltip" style={{ maxWidth }}>
        {text}
      </span>
    </span>
  );
}

export default Tooltip;
