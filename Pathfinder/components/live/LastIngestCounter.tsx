'use client';

// LastIngestCounter — `LAST INGEST · Xs ago`, ticks every 1s.
// Reads the most recent `pathfinder.projects.ingested_at` via realtime.

import React, { useEffect, useReducer } from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import { useLastIngest } from '@/lib/realtime';

export interface LastIngestCounterProps {
  small?: boolean;
}

export function LastIngestCounter({ small }: LastIngestCounterProps) {
  const lastTs = useLastIngest();
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((Date.now() - lastTs) / 1000));
  const label =
    elapsed < 60
      ? `${elapsed}s ago`
      : elapsed < 3600
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s ago`
        : `${Math.floor(elapsed / 3600)}h ago`;

  return (
    <span
      className="pf-mono"
      style={{
        fontSize: small ? 9 : 10,
        color: PF_TINTS.inkDim,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      Last ingest · <span style={{ color: PF_TINTS.ink }}>{label}</span>
    </span>
  );
}

export default LastIngestCounter;
