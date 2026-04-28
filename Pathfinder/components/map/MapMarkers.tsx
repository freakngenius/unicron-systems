'use client';

// MapMarkers — branch / project / customer / warm-intro markers as
// AdvancedMarker DOM children. Pin tier colors come from `lib/types-map.ts`.
//
// Branches: 12px cobalt square + ring + monospaced code label.
// Projects: 8px tier-tinted dot, optional outer ring when high-priority.
// Customers: 6px ring (only visible in cross-poll mode).
// Warm-intro: 10px magenta diamond.

import * as React from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import { TIER_COLORS } from '@/lib/types-map';

const MAP_BG = '#0e1116';

export interface BranchMarkerGMProps {
  lat: number;
  lng: number;
  code: string;
  selected?: boolean;
  onClick?: () => void;
}

export function BranchMarkerGM({ lat, lng, code, selected, onClick }: BranchMarkerGMProps) {
  return (
    <AdvancedMarker position={{ lat, lng }} onClick={onClick} zIndex={selected ? 1000 : 50}>
      <div
        style={{
          position: 'relative',
          width: 26,
          height: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
        title={code}
      >
        <span
          style={{
            position: 'relative',
            width: 12,
            height: 12,
            background: TIER_COLORS.cobalt,
            border: `2px solid ${MAP_BG}`,
            outline: selected ? `1px solid ${TIER_COLORS.cobalt}` : 'none',
            outlineOffset: selected ? 3 : 0,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            font: '600 10px var(--font-jetbrains-mono), ui-monospace, monospace',
            letterSpacing: '0.06em',
            color: '#e6e9ef',
            textShadow: '0 0 4px rgba(0,0,0,0.7)',
            whiteSpace: 'nowrap',
          }}
        >
          {code}
        </span>
      </div>
    </AdvancedMarker>
  );
}

export interface ProjectMarkerGMProps {
  lat: number;
  lng: number;
  color: string;
  hi?: boolean;
  onClick?: () => void;
}

export function ProjectMarkerGM({ lat, lng, color, hi, onClick }: ProjectMarkerGMProps) {
  const r = hi ? 7 : 5;
  return (
    <AdvancedMarker position={{ lat, lng }} onClick={onClick} zIndex={hi ? 100 : 10}>
      <div
        style={{
          position: 'relative',
          width: r * 2 + 8,
          height: r * 2 + 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        {hi && (
          <span
            style={{
              position: 'absolute',
              width: r * 2 + 6,
              height: r * 2 + 6,
              borderRadius: '50%',
              border: `1px solid ${color}`,
              opacity: 0.5,
            }}
          />
        )}
        <span
          style={{
            width: r * 2,
            height: r * 2,
            borderRadius: '50%',
            background: color,
            boxShadow: hi ? `0 0 6px ${color}80` : 'none',
            border: `1.5px solid ${MAP_BG}`,
          }}
        />
      </div>
    </AdvancedMarker>
  );
}

export interface CustomerMarkerGMProps {
  lat: number;
  lng: number;
  warm?: boolean;
}

export function CustomerMarkerGM({ lat, lng, warm }: CustomerMarkerGMProps) {
  const c = warm ? '#a3e635' : '#9aa3b2';
  return (
    <AdvancedMarker position={{ lat, lng }} zIndex={5}>
      <div
        style={{
          width: 12,
          height: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            border: `1px solid ${c}`,
            background: 'transparent',
            boxShadow: warm ? `0 0 0 2px rgba(163,230,53,0.16)` : 'none',
          }}
        />
        <span
          style={{
            position: 'absolute',
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: c,
          }}
        />
      </div>
    </AdvancedMarker>
  );
}

export interface WarmPinGMProps {
  lat: number;
  lng: number;
  label?: string;
  onClick?: () => void;
}

export function WarmPinGM({ lat, lng, label, onClick }: WarmPinGMProps) {
  return (
    <AdvancedMarker position={{ lat, lng }} onClick={onClick} zIndex={500}>
      <div
        style={{
          position: 'relative',
          width: 28,
          height: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            background: TIER_COLORS.magenta,
            transform: 'rotate(45deg)',
            border: `1px solid ${MAP_BG}`,
            boxShadow: '0 0 0 4px rgba(232,121,249,0.18)',
            flexShrink: 0,
          }}
        />
        {label && (
          <span
            style={{
              font: '600 9px var(--font-jetbrains-mono), ui-monospace, monospace',
              letterSpacing: '0.06em',
              color: TIER_COLORS.magenta,
              textShadow: '0 0 4px rgba(0,0,0,0.7)',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        )}
      </div>
    </AdvancedMarker>
  );
}
