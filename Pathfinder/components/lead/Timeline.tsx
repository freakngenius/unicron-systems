'use client';

// Timeline — Stream B Gate B3.
//
// Renders a chronologically-ordered activity list per lead. Mounted in
// LeadDetail; fetches from /api/projects/[id]/timeline. The colored dot
// at the start of each row keys off the event kind, reusing PF_TINTS.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { TimelineEvent, TimelineEventKind } from '@/lib/timeline';

const KIND_DOT_COLOR: Record<TimelineEventKind, string> = {
  ingestion: PF_TINTS.hi,
  scored: PF_TINTS.amber,
  verified: PF_TINTS.violet,
  outreach_drafted: PF_TINTS.warm,
  email_sent: PF_TINTS.ink,
  send_failed: '#dc2626',
  reply_received: '#16a34a',
  stage_change: PF_TINTS.violet,
  meeting_booked: PF_TINTS.amber,
  manual_note: PF_TINTS.inkDim,
  lead_action: PF_TINTS.hi,
};

export interface TimelineProps {
  projectId: string;
  initialEvents?: TimelineEvent[];
}

export function Timeline({ projectId, initialEvents }: TimelineProps) {
  const [events, setEvents] = React.useState<TimelineEvent[]>(initialEvents ?? []);
  const [loading, setLoading] = React.useState<boolean>(!initialEvents);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/pathfinder/api/projects/${encodeURIComponent(projectId)}/timeline`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as TimelineEvent[];
      setEvents(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    if (!initialEvents) void refresh();
  }, [initialEvents, refresh]);

  // Newest-first for UI presentation.
  const ordered = React.useMemo(() => {
    return [...events].sort((a, b) => b.ts.localeCompare(a.ts));
  }, [events]);

  return (
    <section
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 14,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            font: `600 12px ${PF_TINTS.sans}`,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: PF_TINTS.inkSub,
          }}
        >
          Activity timeline
        </h3>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            background: 'transparent',
            border: 'none',
            font: `500 11px ${PF_TINTS.sans}`,
            color: loading ? PF_TINTS.inkFaint : '#9d35ff',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'loading…' : 'refresh'}
        </button>
      </header>
      {error && (
        <div
          role="alert"
          style={{
            padding: '6px 10px',
            border: `1px solid ${hexAlpha('#dc2626', 0.4)}`,
            background: hexAlpha('#dc2626', 0.06),
            color: '#b91c1c',
            borderRadius: PF_TINTS.r.sm,
            font: `500 11px ${PF_TINTS.sans}`,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}
      {ordered.length === 0 && !loading && (
        <div
          style={{
            font: `400 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkDim,
            padding: '8px 0',
          }}
        >
          No activity yet.
        </div>
      )}
      <ul
        data-testid="timeline-list"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {ordered.map((event) => (
          <li
            key={event.id}
            data-event-kind={event.kind}
            style={{
              display: 'grid',
              gridTemplateColumns: '14px 1fr',
              gap: 8,
              padding: '6px 0',
              borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                marginTop: 5,
                borderRadius: '50%',
                background: KIND_DOT_COLOR[event.kind] ?? PF_TINTS.inkDim,
              }}
            />
            <div>
              <div
                style={{
                  font: `600 12px ${PF_TINTS.sans}`,
                  color: PF_TINTS.ink,
                  lineHeight: 1.3,
                }}
              >
                {event.title}
              </div>
              {event.detail && (
                <div
                  style={{
                    font: `400 11px ${PF_TINTS.sans}`,
                    color: PF_TINTS.inkSub,
                    lineHeight: 1.4,
                  }}
                >
                  {event.detail}
                </div>
              )}
              <div
                className="pf-mono"
                style={{
                  font: `500 10px ${PF_TINTS.mono}`,
                  color: PF_TINTS.inkFaint,
                  marginTop: 1,
                }}
              >
                {formatTs(event.ts)} · {event.source_table}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return iso;
  }
}
