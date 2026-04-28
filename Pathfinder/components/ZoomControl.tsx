'use client';

// ZoomControl — bottom-of-map zoom widget. Mirrors the CoordsHUD chrome
// (deep slate, blurred, monospaced) but adds two click targets for + / − and
// surfaces the current zoom level. Sits to the right of the MapLegend.
//
// Zoom is map-only — modifies the SVG viewBox, NOT the page DOM scale, so the
// surrounding UI panels stay put. Keyboard +/- shortcuts live in dashboard.tsx.

import * as React from 'react';

const PF = {
  mapInk: '#e6e9ef',
  mapInkDim: '#9aa3b2',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
export const ZOOM_STEP = 0.5;

export interface ZoomControlProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Optional: shown next to the value. Defaults to nothing. */
  hint?: string;
  /** Override the absolute `left` position. Defaults to immediately right of MapLegend. */
  left?: number;
}

export function ZoomControl({ zoom, onZoomIn, onZoomOut, hint, left = 580 }: ZoomControlProps) {
  const atMin = zoom <= ZOOM_MIN + 1e-6;
  const atMax = zoom >= ZOOM_MAX - 1e-6;
  return (
    <div
      role="group"
      aria-label="Map zoom"
      style={{
        position: 'absolute',
        left,
        bottom: 16,
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
      <span style={{ color: PF.mapInk }}>ZOOM {zoom.toFixed(1)}×</span>
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
