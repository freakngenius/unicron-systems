'use client';

// ChatContextIndicator — top-of-panel strip showing what the chat
// currently knows about. "VIEWING: Hines VA Hospital · Houston" or
// "VIEWING: Houston branch" or "VIEWING: All projects". When the
// underlying view changes the label fades to the new value (180ms).
// When the GET response includes a `resumed` block (the user opened
// chat without a context match and we surfaced their most recent
// thread), an inline "Resumed from: …" pill renders next to the label.

import * as React from 'react';

const PF = {
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  warm: '#a3e635',
} as const;

export interface ChatContextIndicatorProps {
  label: string;
  resumedFrom?: { contextKey: string; contextLabel: string } | null;
}

export function ChatContextIndicator({ label, resumedFrom }: ChatContextIndicatorProps) {
  // Animate label changes by keying off the label itself; React unmounts
  // the inner span and mounts a fresh one, triggering the CSS opacity
  // transition.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderBottom: `1px solid ${PF.ruleSoft}`,
        background: '#ffffff',
      }}
    >
      <span className="pf-label" style={{ color: PF.inkDim }}>
        Viewing
      </span>
      <span
        key={label}
        style={{
          font: '500 12px var(--font-inter), system-ui, sans-serif',
          color: PF.ink,
          letterSpacing: '-0.005em',
          animation: 'pf-chat-fade 180ms ease-out',
        }}
      >
        {label}
      </span>
      {resumedFrom && (
        <span
          className="pf-pill"
          style={{
            marginLeft: 'auto',
            borderColor: PF.warm,
            background: 'rgba(163,230,53,0.12)',
          }}
          title={`Most recent sub-thread: ${resumedFrom.contextLabel}`}
        >
          Resumed · {resumedFrom.contextLabel}
        </span>
      )}
      <style>{`
        @keyframes pf-chat-fade {
          from { opacity: 0; transform: translateY(-2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
