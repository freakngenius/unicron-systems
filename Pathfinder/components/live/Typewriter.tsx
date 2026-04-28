'use client';

// Typewriter — character-by-character text reveal at ~50 chars/sec.
// Trailing block cursor pulses while streaming. Calls `onDone` once.
// Used inside ProjectModal for the first-ever open of a freshly-ranked
// project; subsequent opens render the rationale instantly (caller decides
// based on `isFirstOpen(id)` from `lib/realtime.ts`).

import React, { useEffect, useState } from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import { useLiveKeyframes } from '@/lib/realtime';

export interface TypewriterProps {
  text: string;
  charsPerSec?: number;
  onDone?: () => void;
}

export function Typewriter({ text, charsPerSec = 50, onDone }: TypewriterProps) {
  useLiveKeyframes();
  const [n, setN] = useState(0);

  useEffect(() => {
    setN(0);
    if (!text) {
      onDone?.();
      return;
    }
    const stepMs = 1000 / charsPerSec;
    let done = false;
    const id = setInterval(() => {
      setN((prev) => {
        if (prev >= text.length) {
          if (!done) {
            done = true;
            clearInterval(id);
            onDone?.();
          }
          return prev;
        }
        return prev + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
    // We intentionally don't include `onDone` in deps — the caller may pass
    // a fresh closure each render but the effect only needs to fire on text change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, charsPerSec]);

  const isDone = n >= text.length;
  return (
    <span>
      {text.slice(0, n)}
      {!isDone && (
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: '1em',
            verticalAlign: '-2px',
            background: PF_TINTS.ink,
            marginLeft: 1,
            animation: 'pf-pulse 600ms ease-in-out infinite',
          }}
        />
      )}
    </span>
  );
}

export default Typewriter;
