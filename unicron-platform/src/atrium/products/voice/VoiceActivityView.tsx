// VoiceActivityView — Atrium Products → Voice Agents → Activity sub-sub-tab.
//
// Foundation-merge scope: lists unified activity events from GET /api/voice/activity.
// Full timeline UI with filtering + call-detail panels + transcript scrub
// (prototype's src/app/activity/page.tsx, 2321 LoC) is the follow-up Phase 9.5
// lift.

import { useEffect, useState } from "react";
import { voiceFetch } from "../../lib/voiceFetch";
import { V3PanelCard, V3StatusPill, V3EmptyState } from "./components/v3primitives";

type Event = {
  id: string;
  type: "call" | "project" | "cron_attempt";
  ts: string;
  title: string;
  subtitle: string;
  status?: string | null;
  customer_org_id?: string;
  ref?: { kind: string; id: string };
  meta?: Record<string, unknown>;
};

const TYPE_TONE: Record<Event["type"], "ok" | "warn" | "neutral"> = {
  call:         "ok",
  project:      "neutral",
  cron_attempt: "warn",
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const delta = Date.now() - t;
  const s = Math.round(delta / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function VoiceActivityView() {
  const [rows, setRows] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    voiceFetch("/api/voice/activity?limit=50&exclude_mock=1")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}: ${await r.text().catch(() => "")}`);
        const j = (await r.json()) as { events?: Event[]; error?: string };
        if (cancelled) return;
        if (j.error) setError(j.error);
        else setRows(j.events ?? []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <V3PanelCard
      title="Voice activity"
      subtitle="Unified feed: calls, voice-sourced projects, cron attempts. Detail panel lands in Phase 9.5."
    >
      {error && <V3EmptyState title="Failed to load activity" description={error} />}
      {!error && rows === null && (
        <div style={{ padding: 12, color: "var(--v3-ink-lo)", fontSize: 13 }}>
          Loading activity…
        </div>
      )}
      {!error && rows && rows.length === 0 && (
        <V3EmptyState
          title="No activity yet"
          description="Calls, lead captures, and cron attempts will appear here."
        />
      )}
      {!error && rows && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((e) => (
            <div
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 12,
                alignItems: "start",
                padding: "10px 14px",
                background: "var(--v3-surface)",
                border: "1px solid var(--v3-line)",
                borderRadius: 8,
              }}
            >
              <V3StatusPill tone={TYPE_TONE[e.type]}>{e.type}</V3StatusPill>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--v3-ink)" }}>
                  {e.title}
                </div>
                <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>
                  {e.subtitle}
                </div>
              </div>
              <div
                className="v3-mono"
                style={{ fontSize: 11, color: "var(--v3-ink-lo)", whiteSpace: "nowrap" }}
                title={e.ts}
              >
                {relTime(e.ts)}
              </div>
            </div>
          ))}
        </div>
      )}
    </V3PanelCard>
  );
}
