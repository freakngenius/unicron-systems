// wireframe-primitives.jsx
// Shared greybox primitives for Pathfinder wireframes.
// Style: boxes-and-labels, no decoration. Hand-lettered headings, technical
// monospace labels. One accent color = "meaning" (priority/warm-intro).
// Everything else is grayscale on paper.

const WF = {
  paper: '#f4f1ea',
  paperDark: '#1a1a1a',
  ink: '#1d1b18',
  inkDim: '#6b6864',
  inkFaint: '#9a978f',
  rule: '#1d1b18',
  ruleSoft: 'rgba(29,27,24,0.18)',
  ruleHair: 'rgba(29,27,24,0.10)',
  fill: 'rgba(29,27,24,0.04)',
  fillMid: 'rgba(29,27,24,0.10)',
  accent: '#c84a1e',          // warm orange — high priority / warm-intro
  accentSoft: 'rgba(200,74,30,0.12)',
  branchInk: '#1d1b18',
  hand: '"Caveat", "Bradley Hand", "Comic Sans MS", cursive',
  sans: '"Inter", "Helvetica Neue", system-ui, sans-serif',
  mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
};

// ─── Box: greybox container with optional label tag ─────────────────
function Box({ children, label, sub, style, dashed, fill, accent, ...rest }) {
  return (
    <div
      style={{
        position: 'relative',
        border: `1px ${dashed ? 'dashed' : 'solid'} ${accent ? WF.accent : WF.rule}`,
        background: accent ? WF.accentSoft : (fill ? WF.fill : 'transparent'),
        ...style,
      }}
      {...rest}
    >
      {label && (
        <div style={{
          position: 'absolute', top: -8, left: 8,
          background: WF.paper, padding: '0 6px',
          font: `500 9.5px/1 ${WF.mono}`,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: accent ? WF.accent : WF.ink,
        }}>{label}{sub && <span style={{ color: WF.inkFaint, marginLeft: 6 }}>{sub}</span>}</div>
      )}
      {children}
    </div>
  );
}

// ─── Lines: text-line placeholders. count=lines, w=array of widths in % ──
function Lines({ count = 3, widths, gap = 6, height = 6, color }) {
  const arr = Array.from({ length: count }, (_, i) =>
    widths ? widths[i % widths.length] : 80 - (i * 8) % 50
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {arr.map((w, i) => (
        <div key={i} style={{
          height,
          width: `${w}%`,
          background: color || WF.fillMid,
          borderRadius: 1,
        }} />
      ))}
    </div>
  );
}

// ─── Sketchy hand-lettered heading ──────────────────────────────────
function Hand({ children, size = 20, color, style }) {
  return (
    <div style={{
      font: `400 ${size}px/1.05 ${WF.hand}`,
      color: color || WF.ink,
      letterSpacing: '0.005em',
      ...style,
    }}>{children}</div>
  );
}

// ─── Label: small mono label ────────────────────────────────────────
function Label({ children, color, size = 9.5, style, accent }) {
  return (
    <div style={{
      font: `500 ${size}px/1.2 ${WF.mono}`,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: accent ? WF.accent : (color || WF.inkDim),
      ...style,
    }}>{children}</div>
  );
}

// ─── Sans body text ─────────────────────────────────────────────────
function Body({ children, size = 11, color, weight = 400, style }) {
  return (
    <div style={{
      font: `${weight} ${size}px/1.4 ${WF.sans}`,
      color: color || WF.ink,
      ...style,
    }}>{children}</div>
  );
}

// ─── Annotation: a callout pointing to a thing, hand-style ─────────
function Note({ children, style }) {
  return (
    <div style={{
      font: `400 13px/1.15 ${WF.hand}`,
      color: WF.accent,
      letterSpacing: '0.01em',
      ...style,
    }}>{children}</div>
  );
}

// ─── Pin: small map pin marker ──────────────────────────────────────
function Pin({ x, y, kind = 'project', label, size }) {
  // kind: 'branch' | 'project' | 'project-hi' | 'customer' | 'warm'
  const styles = {
    branch:    { w: 16, h: 16, bg: WF.ink, ring: 2, shape: 'square' },
    project:   { w: 8,  h: 8,  bg: WF.ink, ring: 0, shape: 'dot' },
    'project-hi': { w: 10, h: 10, bg: WF.accent, ring: 0, shape: 'dot' },
    customer:  { w: 6,  h: 6,  bg: 'transparent', ring: 1, shape: 'ring' },
    warm:      { w: 11, h: 11, bg: WF.accent, ring: 0, shape: 'diamond' },
  };
  const s = styles[kind];
  const w = size || s.w, h = size || s.h;
  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      transform: 'translate(-50%,-50%)',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: w, height: h,
        background: s.bg,
        border: s.shape === 'ring' ? `1px solid ${WF.ink}` :
                s.shape === 'square' ? `2px solid ${WF.paper}` : 'none',
        outline: s.shape === 'square' ? `1px solid ${WF.ink}` : 'none',
        borderRadius: s.shape === 'dot' || s.shape === 'ring' ? '50%' : 0,
        transform: s.shape === 'diamond' ? 'rotate(45deg)' : 'none',
      }} />
      {label && (
        <div style={{
          position: 'absolute', left: w + 4, top: -2,
          font: `500 8px/1 ${WF.mono}`,
          color: WF.ink, whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
        }}>{label}</div>
      )}
    </div>
  );
}

// ─── MapStub: greybox North America with rough land outline ─────────
// Drawn from a simplified path. Pure greybox — no real geo.
function MapStub({ width, height, children, dark, showGrid = true, showRadius, radiusAt, radiusSize = 180, dim, showCustomerWarmth }) {
  const bg = dark ? '#222' : '#ebe7df';
  const land = dark ? '#2d2d2d' : '#e0dbd0';
  const stroke = dark ? '#3a3a3a' : 'rgba(29,27,24,0.22)';
  const grid = dark ? 'rgba(255,255,255,0.04)' : 'rgba(29,27,24,0.05)';
  return (
    <div style={{
      position: 'relative',
      width, height,
      background: bg,
      overflow: 'hidden',
      border: `1px solid ${WF.ruleSoft}`,
    }}>
      {/* grid */}
      {showGrid && (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <pattern id={`grid-${width}-${height}`} width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={grid} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#grid-${width}-${height})`} />
        </svg>
      )}
      {/* simplified north america */}
      <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice"
           width={width} height={height}
           style={{ position: 'absolute', inset: 0, opacity: dim ? 0.5 : 1 }}>
        {/* US lower 48 + Canada blob + Mexico — extremely rough greybox */}
        <path d="M 40 60 L 70 40 L 130 30 L 180 25 L 240 30 L 300 35 L 340 50 L 360 70 L 355 90 L 345 95 L 340 100 L 335 105 L 330 110 L 325 115 L 320 120 L 310 125 L 300 130 L 290 138 L 280 145 L 270 152 L 260 158 L 250 162 L 240 165 L 230 168 L 220 170 L 215 175 L 210 180 L 205 185 L 200 188 L 195 192 L 188 198 L 180 202 L 175 205 L 170 200 L 168 195 L 165 188 L 160 178 L 155 170 L 148 162 L 140 158 L 130 152 L 120 148 L 108 142 L 95 138 L 85 132 L 75 125 L 65 118 L 55 108 L 48 95 L 42 80 Z"
              fill={land} stroke={stroke} strokeWidth="1" />
        {/* Florida nub */}
        <path d="M 248 158 L 254 170 L 256 178 L 252 184 L 248 178 Z" fill={land} stroke={stroke} strokeWidth="1" />
        {/* Baja */}
        <path d="M 140 168 L 142 182 L 144 195 L 142 200 L 138 195 L 138 182 Z" fill={land} stroke={stroke} strokeWidth="1" />
      </svg>
      {/* coverage radius highlight */}
      {showRadius && radiusAt && (
        <div style={{
          position: 'absolute',
          left: radiusAt[0] - radiusSize/2,
          top: radiusAt[1] - radiusSize/2,
          width: radiusSize, height: radiusSize,
          borderRadius: '50%',
          border: `1px dashed ${WF.accent}`,
          background: WF.accentSoft,
          pointerEvents: 'none',
        }} />
      )}
      {/* customer warmth: a soft ring around customers */}
      {showCustomerWarmth && showCustomerWarmth.map((c, i) => (
        <div key={i} style={{
          position: 'absolute', left: c[0] - 30, top: c[1] - 30,
          width: 60, height: 60, borderRadius: '50%',
          border: `1px dotted ${WF.accent}`, opacity: 0.7,
        }} />
      ))}
      {children}
    </div>
  );
}

// ─── ScoreBar: visual for Claude score 0–100 ─────────────────────────
function ScoreBar({ value, accent, w = 40 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: w, height: 4, background: WF.ruleHair, position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: 4,
          width: `${value}%`,
          background: accent ? WF.accent : WF.ink,
        }} />
      </div>
      <span style={{ font: `500 9px ${WF.mono}`, color: WF.ink, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Pill: small filter pill ────────────────────────────────────────
function Pill({ children, active, accent }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px',
      border: `1px solid ${active ? WF.ink : WF.ruleSoft}`,
      background: active ? WF.ink : 'transparent',
      color: active ? WF.paper : (accent ? WF.accent : WF.ink),
      font: `500 9px/1 ${WF.mono}`,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      borderRadius: 2,
    }}>{children}</span>
  );
}

// ─── Counter: ticker counter for activity ───────────────────────────
function Counter({ value, label, big }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{
        font: `600 ${big ? 22 : 16}px/1 ${WF.mono}`,
        fontVariantNumeric: 'tabular-nums',
        color: WF.ink,
      }}>{value}</div>
      <Label size={8.5}>{label}</Label>
    </div>
  );
}

// Export to global scope so other Babel scripts can use them.
Object.assign(window, {
  WF, Box, Lines, Hand, Label, Body, Note, Pin, MapStub, ScoreBar, Pill, Counter,
});
