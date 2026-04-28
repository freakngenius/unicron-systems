'use client';

// MapMarkers — legacy google.maps.Marker components for Pathfinder. We use
// the legacy <Marker> instead of <AdvancedMarker> because AdvancedMarker
// requires a Map ID, and a Map ID forces Google to ignore inline `styles`
// on <Map>. Our dark palette comes from inline JSON (the new GCP Map Style
// editor outputs JSON only, no Map ID), so legacy Marker is the right path.
//
// Each marker uses an SVG-as-data-URL icon so the visual language stays
// 1:1 with the prior AdvancedMarker version.

import * as React from 'react';
import { Marker } from '@vis.gl/react-google-maps';
import { TIER_COLORS } from '@/lib/types-map';

const MAP_BG = '#0e1116';

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// ── Branch marker — cobalt square + ring + monospaced code label ─────────
export interface BranchMarkerGMProps {
  lat: number;
  lng: number;
  code: string;
  selected?: boolean;
  onClick?: () => void;
}

export function BranchMarkerGM({ lat, lng, code, selected, onClick }: BranchMarkerGMProps) {
  const icon = React.useMemo(() => {
    // Width grows with code length so the text doesn't clip.
    const labelChars = code.length;
    const w = 18 + labelChars * 7;
    const h = 18;
    const ringStroke = selected
      ? `<rect x="0" y="0" width="18" height="18" fill="none" stroke="${TIER_COLORS.cobalt}" stroke-width="1.5" opacity="0.7"/>`
      : '';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        ${ringStroke}
        <rect x="3" y="3" width="12" height="12" fill="${TIER_COLORS.cobalt}" stroke="${MAP_BG}" stroke-width="2"/>
        <text x="20" y="13" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="#e6e9ef" letter-spacing="0.06em">${code}</text>
      </svg>`;
    return {
      url: svgDataUrl(svg),
      scaledSize: typeof google !== 'undefined' ? new google.maps.Size(w, h) : undefined,
      anchor: typeof google !== 'undefined' ? new google.maps.Point(9, 9) : undefined,
    } as google.maps.Icon;
  }, [code, selected]);
  return (
    <Marker
      position={{ lat, lng }}
      icon={icon}
      onClick={onClick}
      zIndex={selected ? 1000 : 50}
      title={code}
    />
  );
}

// ── Project marker — simple colored dot, slightly larger when hi-priority ─
export interface ProjectMarkerGMProps {
  lat: number;
  lng: number;
  color: string;
  hi?: boolean;
  onClick?: () => void;
}

export function ProjectMarkerGM({ lat, lng, color, hi, onClick }: ProjectMarkerGMProps) {
  const icon = React.useMemo<google.maps.Symbol | null>(() => {
    if (typeof google === 'undefined') return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: MAP_BG,
      strokeWeight: 1.5,
      scale: hi ? 7 : 5,
    };
  }, [color, hi]);
  if (!icon) return null;
  return (
    <Marker
      position={{ lat, lng }}
      icon={icon}
      onClick={onClick}
      zIndex={hi ? 100 : 10}
    />
  );
}

// ── Customer marker — small ring with a center dot. Magenta in cross-poll. ─
export interface CustomerMarkerGMProps {
  lat: number;
  lng: number;
  warm?: boolean;
}

export function CustomerMarkerGM({ lat, lng, warm }: CustomerMarkerGMProps) {
  const c = warm ? TIER_COLORS.magenta : '#9aa3b2';
  const icon = React.useMemo<google.maps.Symbol | null>(() => {
    if (typeof google === 'undefined') return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: 'transparent',
      fillOpacity: 0,
      strokeColor: c,
      strokeWeight: 1.5,
      scale: 5,
    };
  }, [c]);
  if (!icon) return null;
  return <Marker position={{ lat, lng }} icon={icon} zIndex={5} clickable={false} />;
}

// ── Warm-intro pin — magenta diamond + WI-N label ─────────────────────────
export interface WarmPinGMProps {
  lat: number;
  lng: number;
  label?: string;
  onClick?: () => void;
}

export function WarmPinGM({ lat, lng, label, onClick }: WarmPinGMProps) {
  const icon = React.useMemo(() => {
    const labelChars = label ? label.length : 0;
    const w = 22 + labelChars * 7;
    const h = 22;
    const labelText = label
      ? `<text x="22" y="15" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="${TIER_COLORS.magenta}" letter-spacing="0.06em">${label}</text>`
      : '';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <circle cx="11" cy="11" r="9" fill="${TIER_COLORS.magenta}" opacity="0.18"/>
        <rect x="6" y="6" width="10" height="10" fill="${TIER_COLORS.magenta}" stroke="${MAP_BG}" stroke-width="1" transform="rotate(45 11 11)"/>
        ${labelText}
      </svg>`;
    return {
      url: svgDataUrl(svg),
      scaledSize: typeof google !== 'undefined' ? new google.maps.Size(w, h) : undefined,
      anchor: typeof google !== 'undefined' ? new google.maps.Point(11, 11) : undefined,
    } as google.maps.Icon;
  }, [label]);
  return (
    <Marker position={{ lat, lng }} icon={icon} onClick={onClick} zIndex={500} title={label} />
  );
}
