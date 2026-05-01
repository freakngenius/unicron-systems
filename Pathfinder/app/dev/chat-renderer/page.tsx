'use client';

// Dev-only preview page for the chat markdown renderer.
//
// Loads the canonical zedcor-leads fixture and renders it inside the same
// bubble shell ChatMessage uses, so the human reviewer can screenshot
// before/after for the PR description. The streaming toggle plays the
// fixture chunk-by-chunk to verify the streaming-safe placeholder fires.
//
// Mounted at /pathfinder/dev/chat-renderer (next.config.mjs basePath).
// This is a developer affordance — it's not behind any auth and reads no
// real data.

import * as React from 'react';
import { MarkdownRenderer } from '@/components/chat/markdown';

import RAW_FIXTURE from './fixture-loader';

export default function ChatRendererPreview() {
  const [streaming, setStreaming] = React.useState(false);
  const [streamPos, setStreamPos] = React.useState(RAW_FIXTURE.length);

  const intervalRef = React.useRef<number | null>(null);
  const start = React.useCallback(() => {
    setStreaming(true);
    setStreamPos(0);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setStreamPos((p) => {
        const next = p + 6;
        if (next >= RAW_FIXTURE.length) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          window.setTimeout(() => setStreaming(false), 300);
          return RAW_FIXTURE.length;
        }
        return next;
      });
    }, 35);
  }, []);

  const reset = React.useCallback(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setStreaming(false);
    setStreamPos(RAW_FIXTURE.length);
  }, []);

  const content = streaming ? RAW_FIXTURE.slice(0, streamPos) : RAW_FIXTURE;

  return (
    <main style={{ background: '#f6f7f9', minHeight: '100vh', padding: '32px 0' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 16px' }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0a0a0a', marginBottom: 4 }}>
            Chat renderer preview
          </h1>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
            Renders __tests__/chat-renderer/fixtures/zedcor-leads.md inside the same
            bubble shell as ChatMessage uses. Toggle streaming to verify the
            in-flight placeholder.
          </p>
        </header>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={start}
            disabled={streaming}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontFamily: 'ui-monospace, monospace',
              border: '1px solid rgba(10,10,10,0.12)',
              borderRadius: 4,
              background: streaming ? '#e5e7eb' : '#0a0a0a',
              color: streaming ? '#6b7280' : '#ffffff',
              cursor: streaming ? 'not-allowed' : 'pointer',
            }}
          >
            ▶ Replay stream
          </button>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontFamily: 'ui-monospace, monospace',
              border: '1px solid rgba(10,10,10,0.12)',
              borderRadius: 4,
              background: '#ffffff',
              color: '#0a0a0a',
              cursor: 'pointer',
            }}
          >
            ⏹ Show full
          </button>
          <span
            style={{
              alignSelf: 'center',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              color: '#6b7280',
            }}
          >
            {streamPos.toLocaleString()} / {RAW_FIXTURE.length.toLocaleString()} chars
          </span>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid rgba(10,10,10,0.12)',
            borderRadius: 6,
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: '#6b7280',
              marginBottom: 6,
            }}
          >
            Pathfinder
          </div>
          <MarkdownRenderer content={content} streaming={streaming} />
        </div>
      </div>
    </main>
  );
}
