'use client';

// MapLegend — bottom-left chip explaining the marker visual language.
// Color swatches match TIER_COLORS exactly so the legend doesn't drift
// from what the user actually sees on the map. Lime warm green from the
// prior iteration is replaced with magenta (the actual warm-intro color)
// + amber for high-priority — both have stronger contrast on the white
// chrome than lime did.

import * as React from 'react';
import { TIER_COLORS } from '@/lib/types-map';

const PF = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
} as const;

// Slightly darker label colors for tier labels so they stay readable on
// white. The marker fills stay vivid; only the typography is muted.
const LABEL_COBALT = '#3a5cd0';
const LABEL_AMBER = '#a86f1f';
const LABEL_MAGENTA = '#a04ec5';

export interface MapLegendProps {
  crossPoll: boolean;
}

export function MapLegend({ crossPoll }: MapLegendProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 272,
        bottom: 16,
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 5,
        boxShadow: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        zIndex: 4,
      }}
    >
      {/* Branch — cobalt square + ring */}
      <LegendItem
        swatch={
          <span
            style={{
              width: 10,
              height: 10,
              background: TIER_COLORS.cobalt,
              outline: `1px solid ${TIER_COLORS.cobalt}`,
              outlineOffset: 1,
              flexShrink: 0,
            }}
          />
        }
        label="Branch"
        color={LABEL_COBALT}
      />
      {/* Project (default tier) — gray cross */}
      <LegendItem swatch={<CrossSwatch color={TIER_COLORS.gray} />} label="Project" />
      {/* High-priority — amber cross */}
      <LegendItem
        swatch={<CrossSwatch color={TIER_COLORS.amber} />}
        label="High-priority"
        color={LABEL_AMBER}
      />
      {crossPoll && (
        <>
          {/* Customer — magenta ring */}
          <LegendItem
            swatch={
              <span
                style={{
                  width: 9,
                  height: 9,
                  border: `1.5px solid ${TIER_COLORS.magenta}`,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
            }
            label="Customer"
            color={LABEL_MAGENTA}
          />
          {/* Warm-intro — magenta diamond */}
          <LegendItem
            swatch={
              <span
                style={{
                  width: 9,
                  height: 9,
                  background: TIER_COLORS.magenta,
                  transform: 'rotate(45deg)',
                  flexShrink: 0,
                }}
              />
            }
            label="Warm-intro"
            color={LABEL_MAGENTA}
          />
          {/* Demo Polish UX § Gate 2 — line tier legend.
              Mirrors the WarmIntroLines styling so the demo can answer
              "how does the system know?" with a glance. */}
          <LegendItem
            swatch={<LineSwatch tier="exact" />}
            label="Exact match"
            color={LABEL_MAGENTA}
          />
          <LegendItem
            swatch={<LineSwatch tier="fuzzy" />}
            label="Fuzzy match"
            color={LABEL_MAGENTA}
          />
        </>
      )}
    </div>
  );
}

function LineSwatch({ tier }: { tier: 'exact' | 'fuzzy' }) {
  // Render a 14×3 swatch that mirrors the polyline style used on the map:
  // solid stroke for `exact`, dashed reduced-opacity for `fuzzy`.
  if (tier === 'exact') {
    return (
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 2,
          background: TIER_COLORS.magenta,
          flexShrink: 0,
          borderRadius: 1,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 2,
        flexShrink: 0,
        backgroundImage: `repeating-linear-gradient(to right, ${TIER_COLORS.magenta} 0 4px, transparent 4px 7px)`,
        opacity: 0.55,
      }}
    />
  );
}

function CrossSwatch({ color }: { color: string }) {
  return (
    <span
      style={{
        position: 'relative',
        width: 11,
        height: 11,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 1.6,
          background: color,
          transform: 'translateY(-50%)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          width: 1.6,
          background: color,
          transform: 'translateX(-50%)',
        }}
      />
    </span>
  );
}

function LegendItem({
  swatch,
  label,
  color,
}: {
  swatch: React.ReactNode;
  label: string;
  color?: string;
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      <span className="pf-label" style={{ fontSize: 9, color: color || PF.inkDim }}>
        {label}
      </span>
    </span>
  );
}
