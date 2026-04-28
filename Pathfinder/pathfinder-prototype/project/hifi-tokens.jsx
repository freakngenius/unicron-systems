// hifi-tokens.jsx — Pathfinder hi-fi design tokens.
// High-contrast: white chrome + deep slate map. Two meaning colors only.

const PF = {
  // Surfaces
  bg:        '#ffffff',
  bgAlt:     '#f6f7f9',     // panel-on-panel separation, table zebra
  bgRaised:  '#ffffff',     // floating panels (with shadow)
  ink:       '#0a0a0a',     // primary text + branch markers
  inkSub:    '#3a3f46',     // secondary text
  inkDim:    '#6b7280',     // tertiary text, labels
  inkFaint:  '#9ca3af',     // hairline labels
  rule:      '#0a0a0a',     // strong rule
  ruleSoft:  'rgba(10,10,10,0.12)',
  ruleHair:  'rgba(10,10,10,0.06)',

  // Map (deep slate — high contrast against white)
  mapBg:     '#0e1116',
  mapLand:   '#1a1f26',
  mapStroke: 'rgba(255,255,255,0.10)',
  mapGrid:   'rgba(255,255,255,0.04)',
  mapInk:    '#e6e9ef',
  mapInkDim: '#9aa3b2',

  // Meaning (only two — no decoration)
  hi:        '#22d3ee',     // high-priority opportunity (cyan)
  hiSoft:    'rgba(34,211,238,0.14)',
  hiRing:    'rgba(34,211,238,0.45)',
  warm:      '#a3e635',     // cross-pollination warm-intro (lime)
  warmSoft:  'rgba(163,230,53,0.16)',
  warmRing:  'rgba(163,230,53,0.45)',

  // Type
  sans:      '"Inter", system-ui, -apple-system, sans-serif',
  mono:      '"JetBrains Mono", ui-monospace, monospace',

  // Spacing scale (4-based)
  s: { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48 },

  // Radius (one scale)
  r: { sm: 3, md: 5, lg: 8 },

  // Shadow (one scale)
  shadow: {
    sm: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
    md: '0 4px 12px rgba(10,10,10,0.08), 0 0 0 1px rgba(10,10,10,0.06)',
    lg: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
  },
};

// Inject base type once
if (typeof document !== 'undefined' && !document.getElementById('pf-base')) {
  const s = document.createElement('style');
  s.id = 'pf-base';
  s.textContent = `
    .pf-root { font-family: ${PF.sans}; color: ${PF.ink}; -webkit-font-smoothing: antialiased; }
    .pf-mono { font-family: ${PF.mono}; font-variant-numeric: tabular-nums; }
    .pf-label { font: 500 10px/1.2 ${PF.mono}; letter-spacing: 0.08em; text-transform: uppercase; color: ${PF.inkDim}; }
    .pf-h1 { font: 600 22px/1.15 ${PF.sans}; letter-spacing: -0.01em; color: ${PF.ink}; }
    .pf-h2 { font: 600 14px/1.2 ${PF.sans}; letter-spacing: -0.005em; color: ${PF.ink}; }
    .pf-body { font: 400 13px/1.45 ${PF.sans}; color: ${PF.ink}; }
    .pf-meta { font: 500 11px/1.3 ${PF.mono}; color: ${PF.inkDim}; }
    .pf-num { font: 600 14px/1 ${PF.mono}; color: ${PF.ink}; font-variant-numeric: tabular-nums; }
    .pf-btn { background: ${PF.ink}; color: white; border: none; padding: 8px 14px;
              font: 500 12px/1 ${PF.sans}; cursor: pointer; border-radius: ${PF.r.sm}px; letter-spacing: 0.01em; }
    .pf-btn-ghost { background: transparent; color: ${PF.ink}; border: 1px solid ${PF.ruleSoft};
                    padding: 7px 13px; font: 500 12px/1 ${PF.sans}; cursor: pointer; border-radius: ${PF.r.sm}px; }
    .pf-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px;
               border: 1px solid ${PF.ruleSoft}; background: ${PF.bg}; color: ${PF.ink};
               font: 500 10.5px/1 ${PF.mono}; letter-spacing: 0.05em; text-transform: uppercase;
               border-radius: ${PF.r.sm}px; cursor: pointer; }
    .pf-pill-active { background: ${PF.ink}; color: white; border-color: ${PF.ink}; }
    .pf-pill-hi { background: ${PF.hiSoft}; border-color: ${PF.hi}; color: ${PF.ink}; }
    .pf-pill-warm { background: ${PF.warmSoft}; border-color: ${PF.warm}; color: ${PF.ink}; }
    .pf-row { display: flex; align-items: center; }
    .pf-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .pf-scrollbar::-webkit-scrollbar-thumb { background: ${PF.ruleSoft}; border-radius: 3px; }
  `;
  document.head.appendChild(s);
}

window.PF = PF;
