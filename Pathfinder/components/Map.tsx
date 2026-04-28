'use client';

// Map.tsx — wraps the synthetic NA SVG map from the Hi-Fi prototype's `HiFiMap`.
// The map is the protagonist: deep slate background, fine grid, simplified coastline,
// horizontal/vertical state-line strokes for texture. Children render markers, pings,
// coverage rings, etc. in the same 0-900 × 0-540 viewBox.

import * as React from 'react';
import { SVG_VIEWBOX } from './map-projection';

// Stylized North America vector — copied verbatim from `pathfinder-prototype/project/hifi-map.jsx`.
const NA_PATH =
  'M 50 100 L 80 80 L 130 70 L 200 60 L 280 55 L 360 50 L 440 48 L 520 50 L 600 55 L 680 65 L 740 80 L 780 105 L 800 130 L 805 160 L 800 185 L 790 200 L 770 210 L 750 215 L 730 220 L 715 225 L 705 232 L 700 240 L 695 252 L 690 268 L 685 285 L 680 305 L 672 325 L 660 350 L 650 370 L 638 388 L 622 405 L 610 420 L 600 432 L 590 442 L 575 452 L 560 458 L 545 462 L 530 463 L 515 462 L 500 460 L 485 458 L 472 460 L 460 466 L 450 472 L 442 478 L 435 482 L 428 484 L 420 482 L 412 478 L 405 470 L 398 460 L 390 448 L 382 435 L 374 422 L 365 410 L 355 398 L 345 388 L 333 380 L 320 372 L 305 365 L 290 358 L 275 350 L 260 340 L 245 328 L 232 315 L 220 300 L 210 282 L 200 262 L 190 240 L 178 215 L 165 190 L 150 165 L 132 145 L 110 128 L 85 115 Z';
const FLORIDA = 'M 615 405 L 622 425 L 626 445 L 622 460 L 615 452 L 612 435 L 610 418 Z';
const BAJA = 'M 280 365 L 282 388 L 284 410 L 280 420 L 274 410 L 274 388 Z';

// Token references (the design tokens are mirrored in tailwind/globals; we use literals here
// because the SVG is one self-contained surface and keeping it inline is much easier to read).
const MAP_BG = '#0e1116';
const MAP_LAND = '#1a1f26';
const MAP_STROKE = 'rgba(255,255,255,0.10)';
const MAP_GRID = 'rgba(255,255,255,0.04)';

export interface MapProps {
  width: number;
  height: number;
  showGrid?: boolean;
  children?: React.ReactNode;
}

export function Map({ width, height, showGrid = true, children }: MapProps) {
  return (
    <div style={{ position: 'relative', width, height, background: MAP_BG, overflow: 'hidden' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${SVG_VIEWBOX.width} ${SVG_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, display: 'block' }}
      >
        {showGrid && (
          <>
            <defs>
              <pattern id="hifi-grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke={MAP_GRID} strokeWidth="0.5" />
              </pattern>
              <pattern id="hifi-grid-fine" width="15" height="15" patternUnits="userSpaceOnUse">
                <path d="M 15 0 L 0 0 0 15" fill="none" stroke={MAP_GRID} strokeWidth="0.25" />
              </pattern>
            </defs>
            <rect width="900" height="540" fill="url(#hifi-grid-fine)" />
            <rect width="900" height="540" fill="url(#hifi-grid)" />
          </>
        )}
        {/* Land masses */}
        <path d={NA_PATH} fill={MAP_LAND} stroke={MAP_STROKE} strokeWidth="0.5" />
        <path d={FLORIDA} fill={MAP_LAND} stroke={MAP_STROKE} strokeWidth="0.5" />
        <path d={BAJA} fill={MAP_LAND} stroke={MAP_STROKE} strokeWidth="0.5" />
        {/* Simplified state lines for texture */}
        <g stroke={MAP_STROKE} strokeWidth="0.5" fill="none" opacity="0.6">
          <path d="M 200 100 L 200 360" />
          <path d="M 360 80 L 360 420" />
          <path d="M 480 60 L 480 440" />
          <path d="M 600 60 L 600 420" />
          <path d="M 720 90 L 720 380" />
          <path d="M 80 200 L 800 200" />
          <path d="M 120 280 L 780 280" />
          <path d="M 180 360 L 700 360" />
        </g>
        {children}
      </svg>
    </div>
  );
}
