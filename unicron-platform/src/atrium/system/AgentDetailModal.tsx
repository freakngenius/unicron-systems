// AgentDetailModal.tsx — Sprint 7.5 Phase 1
// Editable agent cockpit. Opens on Agents Galaxy node click.
//
// Editable fields: name, description, guiding_prompt, schedule_cron
// Read-only sections: connected tools / agents / site sections / data sources
//   (sourced from agent.config jsonb)
// Save → PATCH /api/atrium/agents/[id] with Taboo Keeper gate.
// Optimistic update with rollback on error. Toast renders audit_log id.
// schedule_cron edits are advisory — Inngest crons are bound to deployed
// function definitions, so a footnote explains the new value goes live on
// next deploy.

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export interface AgentConfigShape {
  watches_agents?: string[];
  watches_signal_topics?: string[];
  connected_tools?: string[];
  connected_agents?: string[];
  connected_sections?: string[];
  data_sources?: string[];
}

export interface AgentRecord {
  id: string;
  name: string;
  archetype: string;
  specialty: string | null;
  description?: string | null;
  guiding_prompt?: string | null;
  schedule_cron?: string | null;
  active: boolean;
  budget: {
    limit_usd_per_period: number;
    current_spent_usd: number;
    period_days: number;
    resets_at: string;
  } | null;
  config: AgentConfigShape | null;
  last_run_at?: string | null;
  last_run_synthetic?: boolean | null;
  created_at: string;
  updated_at?: string;
}

interface PatchResponse {
  ok: boolean;
  agent?: AgentRecord;
  audit_log_id?: string | null;
  cron_advisory?: string | null;
  blocked?: boolean;
  reason?: string;
  matched_rule?: string | null;
  error?: string;
}

// ─── Cron → human helper ──────────────────────────────────────────────────────
// Minimal formatter — handles common cases without a runtime dep. Falls back to
// returning the raw expression if shape isn't recognised.

function humanizeCron(expr: string | null | undefined): string {
  if (!expr) return '';
  // Strip TZ= prefix if present (e.g. "TZ=America/Los_Angeles 0 6 * * *")
  let tz = '';
  let cron = expr.trim();
  const tzMatch = cron.match(/^TZ=([^\s]+)\s+(.+)$/);
  if (tzMatch) {
    tz = ` (${tzMatch[1]})`;
    cron = tzMatch[2];
  }
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hr, dom, mon, dow] = parts;
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (s: string) => s.padStart(2, '0');

  const timeOk = /^\d+$/.test(min) && /^\d+$/.test(hr);
  const timeStr = timeOk ? `${pad(hr)}:${pad(min)}` : `${hr}:${min}`;

  if (dom === '*' && mon === '*' && dow === '*' && timeOk) {
    return `Every day at ${timeStr}${tz}`;
  }
  if (dom === '*' && mon === '*' && /^[0-6]$/.test(dow) && timeOk) {
    return `Every ${dows[Number(dow)]} at ${timeStr}${tz}`;
  }
  if (/^\d+$/.test(dom) && mon === '*' && dow === '*' && timeOk) {
    return `Day ${dom} of every month at ${timeStr}${tz}`;
  }
  if (min.includes(',') || hr.includes(',')) {
    return `At ${hr}:${min} on selected days${tz}`;
  }
  return `${expr}${tz ? '' : ''}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  agentId: string;
  initialAgent?: AgentRecord | null;
  actorId: string | null;
  onClose: () => void;
  onSaved?: (agent: AgentRecord) => void;
}

export default function AgentDetailModal({
  agentId,
  initialAgent,
  actorId,
  onClose,
  onSaved,
}: Props) {
  const initialIsHydrated =
    !!initialAgent && initialAgent.id === agentId && initialAgent.description !== undefined;
  const [loading, setLoading] = useState(!initialIsHydrated);
  const [agent, setAgent] = useState<AgentRecord | null>(initialAgent ?? null);
  const [original, setOriginal] = useState<AgentRecord | null>(initialAgent ?? null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'block'; text: string; auditId?: string | null } | null>(null);

  // Fetch the agent fresh on mount so we always edit the latest server state.
  useEffect(() => {
    if (initialIsHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabase();
        const { data, error } = await sb.rpc('ns_get_agent', { p_agent_id: agentId });
        if (cancelled) return;
        if (error) {
          setToast({ kind: 'err', text: `Failed to load agent: ${error.message}` });
          setLoading(false);
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setAgent(row as AgentRecord);
          setOriginal(row as AgentRecord);
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setToast({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, initialIsHydrated]);

  const cronPreview = useMemo(() => humanizeCron(agent?.schedule_cron), [agent?.schedule_cron]);

  const dirty = useMemo(() => {
    if (!agent || !original) return false;
    return (
      (agent.name ?? '') !== (original.name ?? '') ||
      (agent.description ?? '') !== (original.description ?? '') ||
      (agent.guiding_prompt ?? '') !== (original.guiding_prompt ?? '') ||
      (agent.schedule_cron ?? '') !== (original.schedule_cron ?? '')
    );
  }, [agent, original]);

  function update<K extends keyof AgentRecord>(key: K, value: AgentRecord[K]) {
    setAgent((a) => (a ? { ...a, [key]: value } : a));
  }

  async function handleSave() {
    if (!agent || !original) return;
    if (!actorId) {
      setToast({ kind: 'err', text: 'Sign-in required to save (no actor_id resolved).' });
      return;
    }
    setSaving(true);
    const optimistic: AgentRecord = { ...agent };
    const rollback = original;

    const changes: Record<string, string> = {};
    if ((agent.name ?? '') !== (original.name ?? '')) changes['name'] = agent.name;
    if ((agent.description ?? '') !== (original.description ?? '')) changes['description'] = agent.description ?? '';
    if ((agent.guiding_prompt ?? '') !== (original.guiding_prompt ?? '')) changes['guiding_prompt'] = agent.guiding_prompt ?? '';
    if ((agent.schedule_cron ?? '') !== (original.schedule_cron ?? '')) changes['schedule_cron'] = agent.schedule_cron ?? '';

    try {
      const resp = await fetch(`/api/atrium/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: actorId, ...changes }),
      });
      const json = (await resp.json()) as PatchResponse;

      if (!resp.ok || !json.ok) {
        // Rollback optimistic state
        setAgent(rollback);
        if (json.blocked) {
          setToast({
            kind: 'block',
            text: `Taboo Keeper blocked: ${json.reason ?? 'no reason provided'}${json.matched_rule ? ` (rule: ${json.matched_rule})` : ''}`,
            auditId: json.audit_log_id ?? null,
          });
        } else {
          setToast({ kind: 'err', text: json.error ?? `HTTP ${resp.status}` });
        }
        return;
      }

      const saved = json.agent ?? optimistic;
      setAgent(saved);
      setOriginal(saved);
      setToast({
        kind: 'ok',
        text: json.cron_advisory ? `Saved · ${json.cron_advisory}` : 'Saved',
        auditId: json.audit_log_id ?? null,
      });
      onSaved?.(saved);
    } catch (err) {
      setAgent(rollback);
      setToast({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading || !agent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-bg-card border border-border-default rounded-xl p-8 text-text-secondary mono text-[12px]">
          Loading agent…
        </div>
      </div>
    );
  }

  const cfg = agent.config ?? {};
  const readonlyBlocks: { label: string; values: string[] }[] = [
    { label: 'Connected tools', values: cfg.connected_tools ?? [] },
    { label: 'Connected agents', values: cfg.connected_agents ?? cfg.watches_agents ?? [] },
    { label: 'Connected site sections', values: cfg.connected_sections ?? [] },
    { label: 'Data sources', values: cfg.data_sources ?? cfg.watches_signal_topics ?? [] },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-default rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-text-muted">Agent cockpit</div>
            <div className="mono text-[14px] text-text-primary font-medium mt-0.5">{agent.name}</div>
          </div>
          <button
            onClick={onClose}
            className="mono text-[11px] text-text-muted hover:text-text-primary px-2 py-1 rounded border border-border-default"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <Field label="Name">
            <input
              className="w-full bg-bg-raised border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary"
              value={agent.name ?? ''}
              onChange={(e) => update('name', e.target.value)}
              disabled={saving}
            />
          </Field>

          {/* Description */}
          <Field
            label="Description"
            hint="One-sentence purpose. Shown in the Agents Galaxy roster."
          >
            <input
              className="w-full bg-bg-raised border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary"
              value={agent.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
              placeholder={agent.specialty ?? 'e.g., Refusal gate validator'}
              disabled={saving}
            />
          </Field>

          {/* Guiding prompt */}
          <Field
            label="Guiding prompt"
            hint="System prompt or rubric this agent reads at runtime."
          >
            <textarea
              className="w-full bg-bg-raised border border-border-default rounded-md px-3 py-2 mono text-[12px] text-text-primary min-h-[140px] resize-y"
              value={agent.guiding_prompt ?? ''}
              onChange={(e) => update('guiding_prompt', e.target.value)}
              disabled={saving}
              placeholder="Plain-text instructions, persona, decision rubric…"
            />
          </Field>

          {/* Schedule cron */}
          <Field
            label="Schedule (cron)"
            hint="Inngest expression. Leave blank for event-driven only."
          >
            <input
              className="w-full bg-bg-raised border border-border-default rounded-md px-3 py-2 mono text-[12px] text-text-primary"
              value={agent.schedule_cron ?? ''}
              onChange={(e) => update('schedule_cron', e.target.value)}
              placeholder="e.g., TZ=America/New_York 0 5 * * *"
              disabled={saving}
            />
            {agent.schedule_cron && cronPreview && cronPreview !== agent.schedule_cron && (
              <div className="mono text-[10px] text-text-secondary mt-1.5">{cronPreview}</div>
            )}
            <div className="mono text-[10px] text-text-muted mt-1.5 leading-relaxed">
              Advisory mode: saved to nervous_system.agents and audit_log. Inngest cron schedules are bound to deployed function definitions; the new value goes live on next deploy.
            </div>
          </Field>

          {/* Read-only — config-derived */}
          <div className="pt-2 border-t border-border-default">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-text-muted mb-3">
              Wiring (read-only)
            </div>
            <div className="grid grid-cols-2 gap-3">
              {readonlyBlocks.map((block) => (
                <div key={block.label} className="bg-bg-raised border border-border-default rounded-md p-3">
                  <div className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted mb-1.5">
                    {block.label}
                  </div>
                  {block.values.length === 0 ? (
                    <div className="mono text-[11px] text-text-muted italic">none</div>
                  ) : (
                    <div className="mono text-[11px] text-text-primary leading-snug break-words">
                      {block.values.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Identity */}
          <div className="pt-2 border-t border-border-default mono text-[10px] text-text-muted space-y-0.5">
            <div className="break-all">ID: {agent.id}</div>
            <div>Archetype: {agent.archetype} · {agent.active ? 'Active' : 'Inactive'}</div>
            <div>Created: {new Date(agent.created_at).toLocaleString()}</div>
            {agent.updated_at && <div>Updated: {new Date(agent.updated_at).toLocaleString()}</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-default sticky bottom-0 bg-bg-card">
          {toast ? (
            <div
              className={`mono text-[11px] leading-snug ${
                toast.kind === 'ok'
                  ? 'text-[#2E8E66]'
                  : toast.kind === 'block'
                  ? 'text-[#C28A1F]'
                  : 'text-[#E14B4B]'
              }`}
            >
              {toast.text}
              {toast.auditId && (
                <span className="text-text-muted ml-2 break-all">audit_log id: {toast.auditId}</span>
              )}
            </div>
          ) : (
            <div className="mono text-[11px] text-text-muted">
              {dirty ? 'Unsaved changes' : 'No changes'}
            </div>
          )}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="mono text-[12px] px-3 py-1.5 rounded border border-border-default text-text-secondary hover:text-text-primary"
              disabled={saving}
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="mono text-[12px] px-4 py-1.5 rounded border border-[var(--accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1.5">{label}</div>
      {children}
      {hint && <div className="mono text-[10px] text-text-muted mt-1">{hint}</div>}
    </label>
  );
}
