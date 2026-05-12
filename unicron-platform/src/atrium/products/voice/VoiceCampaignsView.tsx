// VoiceCampaignsView — Atrium Products → Voice Agents → Campaigns sub-sub-tab.
//
// Foundation-merge scope: lists procurement_pull_configs from
// GET /api/voice/procurement-configs. Full campaign builder (prototype's
// src/app/campaigns/page.tsx, 776 LoC of cron-expression editor, office-row
// editor, quiet-hours, qualifying-questions UI) is the follow-up Phase 9.5
// lift.

import { useEffect, useState } from "react";
import { voiceFetch } from "../../lib/voiceFetch";
import { V3PanelCard, V3StatusPill, V3EmptyState } from "./components/v3primitives";

type Config = {
  id: string;
  customer_org_id: string;
  config_name: string;
  is_active: boolean;
  pull_objective: string;
  agent_name: string;
  caller_brand: string;
  vapi_assistant_id: string | null;
  voice_agent_source_id: string | null;
  target_offices: Array<{ key: string; office_name: string; phone: string; enabled?: boolean; cron_expression?: string }>;
  created_at: string;
};

export function VoiceCampaignsView() {
  const [rows, setRows] = useState<Config[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    voiceFetch("/api/voice/procurement-configs")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}: ${await r.text().catch(() => "")}`);
        const j = (await r.json()) as { configs?: Config[]; error?: string };
        if (cancelled) return;
        if (j.error) setError(j.error);
        else setRows(j.configs ?? []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <V3PanelCard
      title="Voice campaigns"
      subtitle="Procurement-pull configs from pathfinder.procurement_pull_configs. Editor lands in Phase 9.5."
    >
      {error && <V3EmptyState title="Failed to load campaigns" description={error} />}
      {!error && rows === null && (
        <div style={{ padding: 12, color: "var(--v3-ink-lo)", fontSize: 13 }}>
          Loading campaigns…
        </div>
      )}
      {!error && rows && rows.length === 0 && (
        <V3EmptyState
          title="No campaigns yet"
          description="Procurement pull campaigns will appear in this list."
        />
      )}
      {!error && rows && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((c) => {
            const officeCount = Array.isArray(c.target_offices) ? c.target_offices.length : 0;
            const enabledCount = Array.isArray(c.target_offices)
              ? c.target_offices.filter((o) => o.enabled !== false).length
              : 0;
            return (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
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
                    {c.config_name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>
                    {c.customer_org_id} · {c.agent_name} · {c.caller_brand}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 4 }}>
                    {c.pull_objective}
                  </div>
                </div>
                <V3StatusPill tone={c.is_active ? "ok" : "neutral"}>
                  {c.is_active ? "active" : "paused"}
                </V3StatusPill>
                <div
                  className="v3-mono"
                  style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}
                >
                  {enabledCount}/{officeCount} offices
                </div>
              </div>
            );
          })}
        </div>
      )}
    </V3PanelCard>
  );
}
