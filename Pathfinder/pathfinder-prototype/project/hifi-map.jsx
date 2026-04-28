// hifi-map.jsx — Pathfinder hi-fi map component (deep slate, vector NA outline).
// Synthetic geo coords mapped to a stylized projection. Pure greybox geometry
// underneath, but rendered with proper visual weight — coastline + grid +
// state lines — to read as a real ops map.

// Synthetic branches (5 Zedcor branches — placeholders, schema-mirrored)
const BRANCHES = [
  { id: 'phx-001', code: 'PHX', name: 'Phoenix',  region: 'AZ', lat: 33.45, lon: -112.07, x: 240, y: 360, count: 12, hi: 0 },
  { id: 'hou-002', code: 'HOU', name: 'Houston',  region: 'TX', lat: 29.76, lon:  -95.36, x: 470, y: 410, count: 28, hi: 4 },
  { id: 'atl-003', code: 'ATL', name: 'Atlanta',  region: 'GA', lat: 33.75, lon:  -84.39, x: 660, y: 360, count: 9,  hi: 1 },
  { id: 'chi-004', code: 'CHI', name: 'Chicago',  region: 'IL', lat: 41.88, lon:  -87.63, x: 580, y: 250, count: 15, hi: 2 },
  { id: 'sea-005', code: 'SEA', name: 'Seattle',  region: 'WA', lat: 47.61, lon: -122.33, x: 200, y: 160, count: 7,  hi: 0 },
];

// Synthetic customers (subset for demo)
const CUSTOMERS = [
  { id: 'c-mh',  name: 'Memorial Hermann',   branch: 'hou-002', x: 460, y: 405 },
  { id: 'c-ph',  name: 'Port of Houston',    branch: 'hou-002', x: 485, y: 420 },
  { id: 'c-bh',  name: 'Banner Health',      branch: 'phx-001', x: 245, y: 355 },
  { id: 'c-mc',  name: 'Maricopa Co.',       branch: 'phx-001', x: 230, y: 370 },
  { id: 'c-ct',  name: 'Centennial Trust',   branch: 'atl-003', x: 655, y: 365 },
  { id: 'c-em',  name: 'Emory Health',       branch: 'atl-003', x: 670, y: 350 },
  { id: 'c-uc',  name: 'United Center',      branch: 'chi-004', x: 575, y: 245 },
];

// Synthetic projects ranked by Claude
const PROJECTS = [
  { id: 'p-01', title: 'TxDOT I-45 corridor security expansion', source: 'sam.gov',  branch: 'hou-002', score: 94, dist: '12.4 mi', value: '$4.2M', stage: 'RFP',  posted: '2026-04-22', x: 455, y: 395, hi: true },
  { id: 'p-02', title: 'Harris Co. detention facility upgrade',  source: 'harris',   branch: 'hou-002', score: 91, dist: '8.1 mi',  value: '$2.6M', stage: 'PRE',  posted: '2026-04-21', x: 478, y: 412, hi: true },
  { id: 'p-03', title: 'Federal courthouse perimeter RFP',       source: 'usaspending', branch: 'hou-002', score: 87, dist: '34.0 mi', value: '$3.8M', stage: 'RFP',  posted: '2026-04-19', x: 495, y: 425, hi: false },
  { id: 'p-04', title: 'METRO bus depot retrofit',               source: 'harris',   branch: 'hou-002', score: 83, dist: '19.2 mi', value: '$1.4M', stage: 'PLN',  posted: '2026-04-18', x: 458, y: 425, hi: false },
  { id: 'p-05', title: 'Port of Houston news mention',           source: 'news',     branch: 'hou-002', score: 76, dist: '22.1 mi', value: '—',     stage: 'NWS',  posted: '2026-04-17', x: 488, y: 430, hi: false },
  { id: 'p-06', title: 'Energy corridor security study',         source: 'sam.gov',  branch: 'hou-002', score: 71, dist: '41.3 mi', value: '$0.9M', stage: 'PLN',  posted: '2026-04-15', x: 442, y: 380, hi: false },
  { id: 'p-07', title: 'Memorial Hermann campus expansion',      source: 'news',     branch: 'hou-002', score: 68, dist: '17.0 mi', value: '—',     stage: 'NWS',  posted: '2026-04-14', x: 470, y: 392, hi: false },
  { id: 'p-08', title: 'Galveston Co. flood control',            source: 'usaspending', branch: 'hou-002', score: 65, dist: '58.4 mi', value: '$5.2M', stage: 'RFP',  posted: '2026-04-12', x: 500, y: 445, hi: false },
  { id: 'p-09', title: 'Sugar Land municipal complex',           source: 'harris',   branch: 'hou-002', score: 61, dist: '24.6 mi', value: '$1.1M', stage: 'PRE',  posted: '2026-04-11', x: 445, y: 425, hi: false },
  // Cross-pollination opportunities
  { id: 'p-10', title: 'Maricopa Co. records modernization',     source: 'sam.gov',  branch: 'phx-001', score: 96, dist: '21.0 mi', value: '$2.8M', stage: 'RFP',  posted: '2026-04-22', x: 250, y: 360, hi: true,  warmFor: 'c-bh' },
  { id: 'p-11', title: 'Atlanta federal courthouse RFP',         source: 'usaspending', branch: 'atl-003', score: 88, dist: '34.0 mi', value: '$5.1M', stage: 'RFP',  posted: '2026-04-20', x: 668, y: 358, hi: true,  warmFor: 'c-ct' },
];

// Stylized North America vector — proper coastline simplified to read as a real map.
// viewBox 0 0 900 540; branches/customers/projects use the same coordinate space.
const NA_PATH = "M 50 100 L 80 80 L 130 70 L 200 60 L 280 55 L 360 50 L 440 48 L 520 50 L 600 55 L 680 65 L 740 80 L 780 105 L 800 130 L 805 160 L 800 185 L 790 200 L 770 210 L 750 215 L 730 220 L 715 225 L 705 232 L 700 240 L 695 252 L 690 268 L 685 285 L 680 305 L 672 325 L 660 350 L 650 370 L 638 388 L 622 405 L 610 420 L 600 432 L 590 442 L 575 452 L 560 458 L 545 462 L 530 463 L 515 462 L 500 460 L 485 458 L 472 460 L 460 466 L 450 472 L 442 478 L 435 482 L 428 484 L 420 482 L 412 478 L 405 470 L 398 460 L 390 448 L 382 435 L 374 422 L 365 410 L 355 398 L 345 388 L 333 380 L 320 372 L 305 365 L 290 358 L 275 350 L 260 340 L 245 328 L 232 315 L 220 300 L 210 282 L 200 262 L 190 240 L 178 215 L 165 190 L 150 165 L 132 145 L 110 128 L 85 115 Z";
const FLORIDA = "M 615 405 L 622 425 L 626 445 L 622 460 L 615 452 L 612 435 L 610 418 Z";
const BAJA   = "M 280 365 L 282 388 L 284 410 L 280 420 L 274 410 L 274 388 Z";

function HiFiMap({ width, height, dark = true, showGrid = true, children, viewBox = '0 0 900 540' }) {
  return (
    <div style={{ position: 'relative', width, height, background: PF.mapBg, overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={viewBox} preserveAspectRatio="xMidYMid slice"
           style={{ position: 'absolute', inset: 0, display: 'block' }}>
        {showGrid && (
          <>
            <defs>
              <pattern id="hifi-grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke={PF.mapGrid} strokeWidth="0.5" />
              </pattern>
              <pattern id="hifi-grid-fine" width="15" height="15" patternUnits="userSpaceOnUse">
                <path d="M 15 0 L 0 0 0 15" fill="none" stroke={PF.mapGrid} strokeWidth="0.25" />
              </pattern>
            </defs>
            <rect width="900" height="540" fill="url(#hifi-grid-fine)" />
            <rect width="900" height="540" fill="url(#hifi-grid)" />
          </>
        )}
        {/* land */}
        <path d={NA_PATH} fill={PF.mapLand} stroke={PF.mapStroke} strokeWidth="0.5" />
        <path d={FLORIDA} fill={PF.mapLand} stroke={PF.mapStroke} strokeWidth="0.5" />
        <path d={BAJA} fill={PF.mapLand} stroke={PF.mapStroke} strokeWidth="0.5" />
        {/* simplified state lines (just a few interior strokes for texture) */}
        <g stroke={PF.mapStroke} strokeWidth="0.5" fill="none" opacity="0.6">
          <path d="M 200 100 L 200 360" /> {/* west */}
          <path d="M 360 80 L 360 420" />
          <path d="M 480 60 L 480 440" /> {/* mid */}
          <path d="M 600 60 L 600 420" />
          <path d="M 720 90 L 720 380" />
          <path d="M 80 200 L 800 200" /> {/* horizontal */}
          <path d="M 120 280 L 780 280" />
          <path d="M 180 360 L 700 360" />
        </g>
        {children}
      </svg>
    </div>
  );
}

// Branch marker — square with high-contrast ring
function BranchMarker({ b, selected, onClick }) {
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      {selected && <circle cx={b.x} cy={b.y} r="14" fill="none" stroke={PF.mapInk} strokeWidth="0.5" opacity="0.5" />}
      <rect x={b.x - 5} y={b.y - 5} width="10" height="10" fill={PF.mapInk}
            stroke={PF.mapBg} strokeWidth="2" />
      <rect x={b.x - 6} y={b.y - 6} width="12" height="12" fill="none" stroke={PF.mapInk} strokeWidth="0.5" />
      <text x={b.x + 10} y={b.y + 3} fill={PF.mapInk} fontSize="9" fontWeight="600"
            fontFamily={PF.mono} letterSpacing="0.06em">{b.code}</text>
    </g>
  );
}

// Project pin — small dot, cyan if high-priority
function ProjectPin({ p, onClick }) {
  const r = p.hi ? 4.5 : 3.2;
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      {p.hi && <circle cx={p.x} cy={p.y} r={r + 4} fill="none" stroke={PF.hi} strokeWidth="0.5" opacity="0.5" />}
      <circle cx={p.x} cy={p.y} r={r} fill={p.hi ? PF.hi : PF.mapInkDim} />
      {p.hi && <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={PF.mapBg} strokeWidth="0.5" />}
    </g>
  );
}

// Customer marker — small ring
function CustomerMarker({ c, dimmed, warm }) {
  return (
    <g opacity={dimmed ? 0.4 : 1}>
      <circle cx={c.x} cy={c.y} r="4" fill="none" stroke={warm ? PF.warm : PF.mapInkDim} strokeWidth="1" />
      <circle cx={c.x} cy={c.y} r="1.5" fill={warm ? PF.warm : PF.mapInkDim} />
    </g>
  );
}

// Coverage radius — translucent ring
function CoverageRadius({ b, miles = 300 }) {
  // 300mi ≈ 75 svg units in this projection (rough)
  const r = 75;
  return (
    <>
      <circle cx={b.x} cy={b.y} r={r} fill={PF.hi} opacity="0.06" />
      <circle cx={b.x} cy={b.y} r={r} fill="none" stroke={PF.hi} strokeWidth="0.6" strokeDasharray="2,3" opacity="0.7" />
      <text x={b.x} y={b.y - r - 6} textAnchor="middle" fill={PF.mapInkDim}
            fontSize="8" fontFamily={PF.mono} letterSpacing="0.08em">300MI</text>
    </>
  );
}

// Warm-intro pin — diamond
function WarmPin({ x, y, label, onClick }) {
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      <circle cx={x} cy={y} r="9" fill={PF.warm} opacity="0.18" />
      <rect x={x - 4} y={y - 4} width="8" height="8" fill={PF.warm}
            transform={`rotate(45 ${x} ${y})`} stroke={PF.mapBg} strokeWidth="0.5" />
      {label && <text x={x + 10} y={y + 3} fill={PF.warm} fontSize="9" fontWeight="600"
                       fontFamily={PF.mono} letterSpacing="0.06em">{label}</text>}
    </g>
  );
}

window.PFData = { BRANCHES, CUSTOMERS, PROJECTS };
window.HiFiMap = HiFiMap;
window.BranchMarker = BranchMarker;
window.ProjectPin = ProjectPin;
window.CustomerMarker = CustomerMarker;
window.CoverageRadius = CoverageRadius;
window.WarmPin = WarmPin;
