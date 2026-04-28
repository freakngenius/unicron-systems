'use client';

// MapLegend — bottom-left chip explaining the marker visual language.
// Mirrors `MapLegend` in `pathfinder-prototype/project/hifi-shell.jsx`.

import * as React from 'react';

const PF = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  hi: '#22d3ee',
  warm: '#a3e635',
} as const;

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
      <LegendItem
        swatch={
          <span
            style={{
              width: 10,
              height: 10,
              background: PF.ink,
              border: `1.5px solid ${PF.bg}`,
              outline: `1px solid ${PF.ink}`,
            }}
          />
        }
        label="Branch"
      />
      <LegendItem
        swatch={<span style={{ width: 7, height: 7, background: PF.inkDim, borderRadius: '50%' }} />}
        label="Project"
      />
      <LegendItem
        swatch={<span style={{ width: 9, height: 9, background: PF.hi, borderRadius: '50%' }} />}
        label="High-priority"
        color={PF.hi}
      />
      {crossPoll && (
        <>
          <LegendItem
            swatch={
              <span
                style={{
                  width: 7,
                  height: 7,
                  border: `1px solid ${PF.warm}`,
                  borderRadius: '50%',
                }}
              />
            }
            label="Customer"
            color={PF.warm}
          />
          <LegendItem
            swatch={
              <span
                style={{ width: 9, height: 9, background: PF.warm, transform: 'rotate(45deg)' }}
              />
            }
            label="Warm-intro"
            color={PF.warm}
          />
        </>
      )}
    </div>
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
