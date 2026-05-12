// VoiceAgentsView — Atrium Products → Voice Agents → Agents sub-sub-tab.
//
// Foundation-merge scope: lists agents from GET /api/voice/sources behind
// bearer-JWT auth. Full builder UI (prototype's src/app/agents/page.tsx,
// 2566 LoC of inline editing, draft management, publish flow, A/B variants,
// voice picker, knowledge pack editor) is the follow-up Phase 9.5 lift.
//
// Translation rules applied (per spec §10):
//   - V3AppShell wrapper removed (parent VoiceTab wraps in V3PageBody).
//   - "use client" stripped.
//   - next/* imports removed.
//   - useRouter cross-tab jumps not present here.
//   - plain fetch('/api/voice-sources') → voiceFetch('/api/voice/sources').
//   - Root render wrapped in <div className="atrium-v3"> for CSS scope.

import { useEffect, useState } from "react";
import { voiceFetch } from "../../lib/voiceFetch";
import { V3PanelCard, V3StatusPill, V3EmptyState } from "./components/v3primitives";

type Source = {
  id: string;
  source_name: string;
  customer_org_id: string;
  agent_type: string;
  status: "draft" | "active" | "paused" | "archived";
  vapi_assistant_id: string | null;
  has_draft: boolean;
  use_case_label: string | null;
  vertical: string | null;
  updated_at: string;
};

const STATUS_TONE: Record<Source["status"], "ok" | "warn" | "neutral" | "err"> = {
  active: "ok",
  draft: "neutral",
  paused: "warn",
  archived: "err",
};

export function VoiceAgentsView() {
  const [rows, setRows] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    voiceFetch("/api/voice/sources")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}: ${await r.text().catch(() => "")}`);
        const j = (await r.json()) as { sources?: Source[]; error?: string };
        if (cancelled) return;
        if (j.error) setError(j.error);
        else setRows(j.sources ?? []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <V3PanelCard
      title="Voice agents"
      subtitle="Sources lifted from pathfinder.voice_agent_sources. Edit + publish UI lands in the follow-up (Phase 9.5)."
    >
      {error && (
        <V3EmptyState
          title="Failed to load agents"
          description={error}
        />
      )}
      {!error && rows === null && (
        <div style={{ padding: 12, color: "var(--v3-ink-lo)", fontSize: 13 }}>
          Loading agents…
        </div>
      )}
      {!error && rows && rows.length === 0 && (
        <V3EmptyState
          title="No agents yet"
          description="Voice agents you create here will appear in this list."
        />
      )}
      {!error && rows && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((s) => (
            <div
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: 14,
                alignItems: "center",
                padding: "12px 14px",
                background: "var(--v3-surface)",
                border: "1px solid var(--v3-line)",
                borderRadius: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--v3-ink)" }}>
                  {s.source_name}
                </div>
                <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>
                  {[s.customer_org_id, s.agent_type, s.vertical, s.use_case_label]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <V3StatusPill tone={STATUS_TONE[s.status]}>{s.status}</V3StatusPill>
              {s.has_draft && <V3StatusPill tone="warn">draft</V3StatusPill>}
              <div
                className="v3-mono"
                style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}
                title={s.vapi_assistant_id ?? "no assistant linked"}
              >
                {s.vapi_assistant_id ? `vapi:${s.vapi_assistant_id.slice(0, 8)}…` : "no vapi"}
              </div>
            </div>
          ))}
        </div>
      )}
    </V3PanelCard>
  );
}
