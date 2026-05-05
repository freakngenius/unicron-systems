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
        // Cap at the right panel boundary so the legend never collides with
        // the right rail on narrow viewports — items wrap to a second row
        // instead of clipping. Right panel sits at right: 16 + ~360px.
        maxWidth: 'calc(100vw - 272px - 360px - 32px)',
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 5,
        boxShadow: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        rowGap: 6,
        columnGap: 18,
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
          {/* Warm-intro — magenta diamond (lead-level indicator) */}
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
          {/* Gate 18A — explicit solid vs dashed match-tier lines. */}
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
  // Inline SVG mirrors the WarmIntroLines polyline style: solid stroke for
  // `exact`, dashed for `fuzzy`. Renders at exact pixel dimensions to keep
  // the visual identical across browsers.
  const isExact = tier === 'exact';
  return (
    <svg
      width={18}
      height={6}
      viewBox="0 0 18 6"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <line
        x1={0}
        y1={3}
        x2={18}
        y2={3}
        stroke={TIER_COLORS.magenta}
        strokeWidth={isExact ? 2 : 1.5}
        strokeLinecap="round"
        strokeDasharray={isExact ? undefined : '3 2'}
        opacity={isExact ? 1 : 0.7}
      />
    </svg>
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
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {swatch}
      <span
        className="pf-label"
        style={{
          fontSize: 9,
          color: color || PF.inkDim,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </span>
  );
}
