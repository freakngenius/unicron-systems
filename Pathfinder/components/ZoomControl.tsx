'use client';

// ZoomControl — bottom-right zoom widget docked immediately left of the right
// panel rail. Mirrors the CoordsHUD chrome (deep slate, blurred, monospaced)
// with two click targets for + / − and a current zoom level readout. Repositioned
// in Gate 18B from bottom-center, where it was colliding with the MapLegend.
//
// Zoom is map-only — modifies the SVG viewBox, NOT the page DOM scale, so the
// surrounding UI panels stay put. Keyboard +/- shortcuts live in dashboard.tsx.

import * as React from 'react';

const PF = {
  mapInk: '#e6e9ef',
  mapInkDim: '#9aa3b2',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

// Match Google Maps' zoom range for the Pathfinder map (configured on
// <Map minZoom={3} maxZoom={16}> in dashboard.tsx). The previous value of 6
// here was leftover from the SVG-era stylized scale and made the zoom-in
// button stay disabled past the auto-fit zoom.
export const ZOOM_MIN = 3;
export const ZOOM_MAX = 16;
export const ZOOM_STEP = 1;

export interface ZoomControlProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Optional: shown next to the value. Defaults to nothing. */
  hint?: string;
  /** Override the absolute `left` position. When provided, anchors from the left
   *  (legacy bottom-center placement). */
  left?: number;
  /** Override the absolute `right` position. Used to dock immediately left of
   *  the right panel rail. Defaults to 412 (right panel sits at right: 16 with
   *  width 380, so 16 + 380 + 16 = 412). */
  right?: number;
}

export function ZoomControl({ zoom, onZoomIn, onZoomOut, hint, left, right }: ZoomControlProps) {
  const atMin = zoom <= ZOOM_MIN + 1e-6;
  const atMax = zoom >= ZOOM_MAX - 1e-6;
  // Anchor: use `left` only when explicitly provided; otherwise dock to the
  // bottom-right corner, immediately left of the right panel.
  const positionStyle: React.CSSProperties =
    left !== undefined ? { left, bottom: 16 } : { right: right ?? 412, bottom: 16 };
  return (
    <div
      role="group"
      aria-label="Map zoom"
      style={{
        position: 'absolute',
        ...positionStyle,
        background: 'rgba(14,17,22,0.85)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 5,
        padding: '4px 4px 4px 10px',
        font: `500 10px ${PF.mono}`,
        letterSpacing: '0.06em',
        color: PF.mapInkDim,
        zIndex: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ color: PF.mapInk }}>ZOOM {zoom.toFixed(0)}×</span>
      <span style={{ color: 'rgba(255,255,255,0.2)' }}>│</span>
      <ZoomButton symbol="−" label="Zoom out (–)" disabled={atMin} onClick={onZoomOut} />
      <ZoomButton symbol="+" label="Zoom in (+)" disabled={atMax} onClick={onZoomIn} />
      {hint && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>│</span>
          <span>{hint}</span>
        </>
      )}
    </div>
  );
}

function ZoomButton({
  symbol,
  label,
  disabled,
  onClick,
}: {
  symbol: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        appearance: 'none',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: disabled ? 'rgba(230,233,239,0.35)' : '#e6e9ef',
        cursor: disabled ? 'not-allowed' : 'pointer',
        font: `600 12px ${PF.mono}`,
        lineHeight: 1,
        padding: '4px 8px',
        borderRadius: 3,
        minWidth: 22,
        textAlign: 'center',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
      }}
    >
      {symbol}
    </button>
  );
}
