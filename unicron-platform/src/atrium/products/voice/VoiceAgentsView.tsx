// VoiceAgentsView — Atrium Products → Voice Agents → Agents sub-sub-tab.
//
// Two-column master-detail. Left: filterable agent list. Right: detail panel
// with V3Tabs (Configure / Test / Prompt Lab / History). Only Configure is
// fully ported in this catch-up sprint per Kyle 2026-05-12: build the full
// detail panel + CallingModePanel; defer Test/PromptLab/History panels to a
// follow-up.
//
// Translated from prototype src/app/agents/page.tsx (V3AgentsPage + ConfigureTab
// + VoiceModelPanel). Atrium deltas:
//   - voiceFetch attaches bearer JWT on every call.
//   - Endpoints repointed from /api/voice-sources to /api/voice/sources.
//   - draft_config overlay merged on selection (matches prototype).
//   - Save (POST/PATCH) + Publish (POST [id]/publish) + Delete wired.
//   - Voice preview audio via /api/voice/voices/preview.
//   - LLM picker reads from src/lib/voice/llmCatalog.LLM_CATALOG.
//   - normalizeForCompare etc. left to CallingModePanel; this view never
//     touches calling-mode internals directly.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { voiceFetch } from '../../lib/voiceFetch';
import {
  V3PanelCard,
  V3StatusPill,
  V3EmptyState,
  V3Btn,
  V3GatedAction,
  V3FieldRow,
  V3InputStyle,
  V3Tabs,
  VoicePhone,
  v3toast,
} from './components/v3primitives';
import { I } from './components/icons';
import { CallingModePanel } from './components/CallingModePanel';
import type { CallingModeSource } from './components/CallingModePanel';
import { LLM_CATALOG } from '../../../lib/voice/llmCatalog';

type Source = {
  id: string;
  source_name: string;
  customer_org_id: string;
  agent_type: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  vapi_assistant_id: string | null;
  has_draft: boolean;
  use_case_label: string | null;
  vertical: string | null;
  updated_at: string;
  published_at?: string | null;
  draft_config?: Record<string, unknown> | null;
  voice_id?: string | null;
  voice_model?: string | null;
  voice_stability?: number | null;
  voice_similarity_boost?: number | null;
  voice_style?: number | null;
  voice_speed?: number | null;
  voice_use_speaker_boost?: boolean | null;
  llm_model?: string;
  llm_temperature?: number;
  endpointing_wait_seconds?: number;
  system_prompt?: string;
  first_message?: string;
  first_message_mode?:
    | 'assistant-speaks-first'
    | 'assistant-waits-for-user'
    | 'assistant-speaks-first-with-model-generated-message';
  allowlist_mode?: 'allowlist' | 'hubspot' | 'open' | null;
  allowlist_phones?: string[] | null;
  hubspot_filter?: CallingModeSource['hubspot_filter'];
  open_mode_confirmed_by?: string | null;
  open_mode_confirmed_at?: string | null;
};

type VoiceOpt = { voice_id: string; name: string };
type CustomerOpt = { id: string; name: string };
type UseCaseOpt = { agent_type: string; label: string };

const SEED_USE_CASES: UseCaseOpt[] = [
  { agent_type: 'discovery', label: 'Discovery' },
  { agent_type: 'procurement_records_pull', label: 'Procurement records pull' },
  { agent_type: 'procurement_weekly_checkin', label: 'Procurement weekly check-in' },
  { agent_type: 'sdr_top_of_funnel', label: 'SDR top of funnel' },
];

const STATUS_TONE: Record<Source['status'], 'ok' | 'warn' | 'neutral' | 'err'> = {
  active: 'ok',
  draft: 'neutral',
  paused: 'warn',
  archived: 'err',
};

function useCaseTone(slug: string): 'info' | 'pass' | 'ok' | 'warn' {
  if (slug.startsWith('procurement')) return 'info';
  if (slug.startsWith('sdr')) return 'pass';
  if (slug.startsWith('discovery')) return 'ok';
  return 'warn';
}

function useCaseLabel(s: Source, useCases: UseCaseOpt[]): string {
  if (s.use_case_label) return s.use_case_label;
  return useCases.find((u) => u.agent_type === s.agent_type)?.label ?? s.agent_type;
}

export function VoiceAgentsView() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [voices, setVoices] = useState<VoiceOpt[]>([]);
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [useCases, setUseCases] = useState<UseCaseOpt[]>(SEED_USE_CASES);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'configure' | 'test' | 'promptlab' | 'history'>('configure');
  const [draft, setDraft] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadSources() {
    try {
      const r = await voiceFetch('/api/voice/sources');
      if (!r.ok) throw new Error(`${r.status}: ${await r.text().catch(() => '')}`);
      const j = (await r.json()) as { sources?: Source[]; error?: string };
      if (j.error) {
        setLoadErr(j.error);
      } else {
        setSources(j.sources ?? []);
      }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function loadVoices() {
    try {
      const r = await voiceFetch('/api/voice/voices');
      if (!r.ok) return;
      const j = (await r.json()) as { voices?: VoiceOpt[] };
      setVoices(j.voices ?? []);
    } catch { /* non-fatal */ }
  }
  async function loadCustomers() {
    try {
      const r = await voiceFetch('/api/voice/customers');
      if (!r.ok) return;
      const j = (await r.json()) as { customers?: CustomerOpt[] };
      setCustomers(j.customers ?? []);
    } catch { /* non-fatal */ }
  }
  async function loadUseCases() {
    try {
      const r = await voiceFetch('/api/voice/use-cases');
      if (!r.ok) return;
      const j = (await r.json()) as { use_cases?: UseCaseOpt[] };
      const merged: UseCaseOpt[] = [...SEED_USE_CASES];
      for (const u of j.use_cases ?? []) {
        if (!merged.find((m) => m.agent_type === u.agent_type)) merged.push(u);
      }
      setUseCases(merged);
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    void loadSources();
    void loadVoices();
    void loadCustomers();
    void loadUseCases();
  }, []);

  const selected = useMemo(
    () => (sources ?? []).find((s) => s.id === selectedId) ?? null,
    [sources, selectedId]
  );

  useEffect(() => {
    if (selected) {
      const overlay = selected.draft_config && typeof selected.draft_config === 'object'
        ? selected.draft_config
        : {};
      setDraft({ ...selected, ...overlay });
    } else {
      setDraft(null);
    }
  }, [selectedId, selected]);

  async function onSave() {
    if (!draft || !selectedId) return;
    setBusy(true);
    try {
      const r = await voiceFetch(`/api/voice/sources?id=${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; source?: Source };
      if (!r.ok || !j.ok) throw new Error(j.error ?? 'save failed');
      v3toast('Agent saved', 'ok');
      await loadSources();
    } catch (e) {
      v3toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await voiceFetch(`/api/voice/sources/${selected.id}/publish`, {
        method: 'POST',
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; vapi_error?: string };
      if (!r.ok || !j.ok) {
        throw new Error(j.vapi_error ?? j.error ?? 'publish failed');
      }
      v3toast('Published to Vapi', 'ok');
      await loadSources();
    } catch (e) {
      v3toast(`Publish failed: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!selected) return;
    if (!window.confirm(`Delete agent "${selected.source_name}"?`)) return;
    setBusy(true);
    try {
      const r = await voiceFetch(`/api/voice/sources?id=${selected.id}`, {
        method: 'DELETE',
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) throw new Error(j.error ?? 'delete failed');
      v3toast('Deleted', 'ok');
      setSelectedId(null);
      await loadSources();
    } catch (e) {
      v3toast(`Delete failed: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setBusy(false);
    }
  }

  if (loadErr) {
    return (
      <V3PanelCard title="Voice agents">
        <V3EmptyState title="Failed to load agents" description={loadErr} />
      </V3PanelCard>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: 16,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Master list */}
      <V3PanelCard padding={0} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--v3-line-soft)',
            fontSize: 12,
            color: 'var(--v3-ink-lo)',
            textTransform: 'uppercase',
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
        >
          All agents
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sources === null && (
            <div style={{ padding: 12, color: 'var(--v3-ink-lo)', fontSize: 13 }}>Loading…</div>
          )}
          {sources && sources.length === 0 && (
            <V3EmptyState title="No agents yet" description="Voice agents you create will appear here." />
          )}
          {sources && sources.length > 0 &&
            sources.map((s) => {
              const isActive = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 6,
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--v3-line-soft)',
                    background: isActive ? 'var(--v3-blue-soft)' : 'transparent',
                    cursor: 'pointer',
                    border: 'none',
                    borderLeft: isActive ? '3px solid var(--v3-blue)' : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <VoicePhone size={12} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--v3-ink)', flex: 1 }}>
                      {s.source_name}
                    </span>
                    <V3StatusPill tone={STATUS_TONE[s.status]}>{s.status}</V3StatusPill>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <V3StatusPill tone={useCaseTone(s.agent_type)}>
                      {useCaseLabel(s, useCases)}
                    </V3StatusPill>
                    {s.has_draft && <V3StatusPill tone="warn">draft</V3StatusPill>}
                  </div>
                </button>
              );
            })}
        </div>
      </V3PanelCard>

      {/* Detail */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {!selected ? (
          <V3PanelCard padding={0} style={{ flex: 1 }}>
            <V3EmptyState
              title="Pick an agent"
              description="Select an agent from the list to configure prompts, voice, calling mode, and publish."
            />
          </V3PanelCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2
                className="v3-display"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'var(--v3-ink)',
                  margin: 0,
                  letterSpacing: -0.3,
                }}
              >
                {selected.source_name}
              </h2>
              <V3StatusPill tone={useCaseTone(selected.agent_type)}>
                {useCaseLabel(selected, useCases)}
              </V3StatusPill>
              <V3StatusPill tone={selected.status === 'active' ? 'ok' : 'warn'}>
                {selected.status}
              </V3StatusPill>
              {selected.has_draft ? (
                <V3StatusPill tone="warn">unpublished changes</V3StatusPill>
              ) : selected.published_at ? (
                <V3StatusPill tone="ok">published</V3StatusPill>
              ) : (
                <V3StatusPill tone="neutral">not published</V3StatusPill>
              )}
              <div style={{ flex: 1 }} />
              <V3Btn kind="ghost" onClick={onDelete} disabled={busy} icon={<I.Trash size={12} />}>
                Delete
              </V3Btn>
              <V3GatedAction onCommit={onSave} label="Saving">
                <V3Btn kind="ghost" disabled={busy}>Save draft</V3Btn>
              </V3GatedAction>
              <V3GatedAction onCommit={onPublish} label="Publishing">
                <V3Btn
                  kind="primary"
                  disabled={busy || (!selected.has_draft && !!selected.published_at)}
                >
                  {selected.has_draft ? 'Publish' : 'Re-publish'}
                </V3Btn>
              </V3GatedAction>
            </div>

            <V3Tabs
              tabs={[
                { id: 'configure', label: 'Configure', icon: I.Settings },
                { id: 'test', label: 'Test', icon: I.Phone },
                { id: 'promptlab', label: 'Prompt Lab', icon: I.Sparkle },
                { id: 'history', label: 'History', icon: I.Activity },
              ]}
              active={tab}
              setActive={(id) => setTab(id as typeof tab)}
            />

            <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4 }}>
              {tab === 'configure' && draft && (
                <ConfigureTab
                  draft={draft}
                  setDraft={setDraft}
                  voices={voices}
                  customers={customers}
                  useCases={useCases}
                />
              )}
              {tab === 'test' && (
                <V3PanelCard padding={30}>
                  <V3EmptyState
                    title="Test panel — Phase 9.5"
                    description="WebCall + DialOut panels translate to follow-up sprint. Configure + publish work today."
                  />
                </V3PanelCard>
              )}
              {tab === 'promptlab' && (
                <V3PanelCard padding={30}>
                  <V3EmptyState
                    title="Prompt Lab — Phase 9.5"
                    description="A/B prompt versions require agent_prompt_versions table writes (stubbed in v2 foundation dispatch). Follow-up sprint."
                  />
                </V3PanelCard>
              )}
              {tab === 'history' && (
                <V3PanelCard padding={30}>
                  <V3EmptyState
                    title="History — Phase 9.5"
                    description="Per-agent transcript scrub lands in the same follow-up as the Test panel."
                  />
                </V3PanelCard>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigureTab({
  draft,
  setDraft,
  voices,
  customers,
  useCases,
}: {
  draft: Source;
  setDraft: (s: Source) => void;
  voices: VoiceOpt[];
  customers: CustomerOpt[];
  useCases: UseCaseOpt[];
}) {
  const update = (patch: Partial<Source>) => setDraft({ ...draft, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <V3PanelCard title="Basics" subtitle="Identity, status, and routing">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <V3FieldRow label="Agent name">
            <input
              value={draft.source_name}
              onChange={(e) => update({ source_name: e.target.value })}
              style={V3InputStyle}
            />
          </V3FieldRow>
          <V3FieldRow label="Use case">
            <select
              value={draft.agent_type}
              onChange={(e) => {
                const val = e.target.value;
                const found = useCases.find((u) => u.agent_type === val);
                update({ agent_type: val, use_case_label: found?.label ?? val });
              }}
              style={V3InputStyle}
            >
              {useCases.map((u) => (
                <option key={u.agent_type} value={u.agent_type}>{u.label}</option>
              ))}
              {!useCases.find((u) => u.agent_type === draft.agent_type) && (
                <option value={draft.agent_type}>{draft.agent_type}</option>
              )}
            </select>
          </V3FieldRow>
          <V3FieldRow label="Customer">
            <select
              value={draft.customer_org_id}
              onChange={(e) => update({ customer_org_id: e.target.value })}
              style={V3InputStyle}
            >
              {customers.length === 0 && (
                <option value={draft.customer_org_id}>{draft.customer_org_id}</option>
              )}
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.id}</option>
              ))}
            </select>
          </V3FieldRow>
          <V3FieldRow label="Status">
            <select
              value={draft.status}
              onChange={(e) => update({ status: e.target.value as Source['status'] })}
              style={V3InputStyle}
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
          </V3FieldRow>
        </div>
      </V3PanelCard>

      <CallingModePanel draft={draft as CallingModeSource} update={(p) => update(p as Partial<Source>)} />

      <VoiceModelPanel draft={draft} update={update} voices={voices} />

      <V3PanelCard title="Prompts" subtitle="First message and full system prompt">
        <V3FieldRow label="Who speaks first">
          <select
            value={draft.first_message_mode ?? 'assistant-speaks-first'}
            onChange={(e) =>
              update({ first_message_mode: e.target.value as Source['first_message_mode'] })
            }
            style={V3InputStyle}
          >
            <option value="assistant-speaks-first">
              Assistant speaks first (uses First message below)
            </option>
            <option value="assistant-waits-for-user">
              Assistant waits for user (stays silent until they speak)
            </option>
            <option value="assistant-speaks-first-with-model-generated-message">
              Assistant speaks first with model-generated message
            </option>
          </select>
        </V3FieldRow>
        <div style={{ height: 14 }} />
        <V3FieldRow label="First message">
          <input
            value={draft.first_message ?? ''}
            onChange={(e) => update({ first_message: e.target.value })}
            placeholder="What the assistant says when the call connects"
            style={V3InputStyle}
          />
          {draft.first_message_mode === 'assistant-waits-for-user' && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--v3-ink-lo)' }}>
              Saved but not used at runtime in this mode. Vapi will not speak it.
            </div>
          )}
          {draft.first_message_mode === 'assistant-speaks-first-with-model-generated-message' && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--v3-ink-lo)' }}>
              Used as a fallback opener if the model cannot generate one.
            </div>
          )}
        </V3FieldRow>
        <div style={{ height: 14 }} />
        <V3FieldRow label="System prompt">
          <textarea
            rows={12}
            value={draft.system_prompt ?? ''}
            onChange={(e) => update({ system_prompt: e.target.value })}
            style={{
              ...V3InputStyle,
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 12,
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
        </V3FieldRow>
      </V3PanelCard>
    </div>
  );
}

function VoiceModelPanel({
  draft,
  update,
  voices,
}: {
  draft: Source;
  update: (patch: Partial<Source>) => void;
  voices: VoiceOpt[];
}) {
  const [previewing, setPreviewing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState(
    'Hi, this is a test of the agent voice. How does it sound to you?'
  );

  async function previewVoice() {
    setPreviewing(true);
    try {
      const r = await voiceFetch('/api/voice/voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_id: draft.voice_id,
          model: draft.voice_model ?? 'eleven_turbo_v2_5',
          text: previewText,
          stability: draft.voice_stability ?? 0.5,
          similarity_boost: draft.voice_similarity_boost ?? 0.75,
          style: draft.voice_style ?? 0,
          speed: draft.voice_speed ?? 1,
          use_speaker_boost: draft.voice_use_speaker_boost ?? true,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || 'preview failed');
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e) {
      v3toast(`Preview failed: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setPreviewing(false);
    }
  }

  const stab = draft.voice_stability ?? 0.5;
  const sim = draft.voice_similarity_boost ?? 0.75;
  const sty = draft.voice_style ?? 0;
  const spd = draft.voice_speed ?? 1;
  const temp = draft.llm_temperature ?? 0.85;

  return (
    <V3PanelCard title="Voice & model" subtitle="11labs voice, sliders, LLM, endpointing">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <V3FieldRow label="Voice (pick from library)">
          <select
            value={draft.voice_id ?? ''}
            onChange={(e) => update({ voice_id: e.target.value || null })}
            style={V3InputStyle}
          >
            <option value="">(custom — paste ID below)</option>
            {voices.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.name} — {v.voice_id.slice(0, 8)}
              </option>
            ))}
          </select>
        </V3FieldRow>
        <V3FieldRow label="Voice ID (paste any ElevenLabs ID)">
          <input
            value={draft.voice_id ?? ''}
            onChange={(e) => update({ voice_id: e.target.value || null })}
            placeholder="e.g. Uc7anshoV8mdBhDnEZEX"
            style={{ ...V3InputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
          />
        </V3FieldRow>
        <V3FieldRow label="Voice model">
          <select
            value={draft.voice_model ?? ''}
            onChange={(e) => update({ voice_model: e.target.value })}
            style={V3InputStyle}
          >
            <option value="eleven_turbo_v2_5">eleven_turbo_v2_5</option>
            <option value="eleven_multilingual_v2">eleven_multilingual_v2</option>
            <option value="eleven_flash_v2_5">eleven_flash_v2_5</option>
            <option value="eleven_turbo_v2">eleven_turbo_v2</option>
          </select>
        </V3FieldRow>
        <V3FieldRow label="LLM model">
          <select
            value={draft.llm_model ?? ''}
            onChange={(e) => update({ llm_model: e.target.value })}
            style={V3InputStyle}
          >
            {(() => {
              const known = new Set(LLM_CATALOG.flatMap((g) => g.models.map((m) => m.id)));
              const showLegacy = draft.llm_model && !known.has(draft.llm_model);
              const opts: ReactNode[] = [];
              if (showLegacy) {
                opts.push(
                  <option key="__legacy" value={draft.llm_model}>{draft.llm_model} (legacy)</option>
                );
              }
              LLM_CATALOG.forEach((group) => {
                opts.push(
                  <optgroup key={group.provider} label={group.label}>
                    {group.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </optgroup>
                );
              });
              return opts;
            })()}
          </select>
        </V3FieldRow>
      </div>

      <div style={{ height: 14 }} />
      <div
        style={{
          padding: 14,
          background: 'var(--v3-bg)',
          border: '1px solid var(--v3-line-soft)',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--v3-ink-lo)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 10,
          }}
        >
          Voice variability
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <V3FieldRow label={`Stability: ${stab.toFixed(2)} — lower = more expressive`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={stab}
              onChange={(e) => update({ voice_stability: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
          </V3FieldRow>
          <V3FieldRow label={`Similarity boost: ${sim.toFixed(2)} — higher = closer to source`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sim}
              onChange={(e) => update({ voice_similarity_boost: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
          </V3FieldRow>
          <V3FieldRow label={`Style: ${sty.toFixed(2)} — higher = more stylized`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sty}
              onChange={(e) => update({ voice_style: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
          </V3FieldRow>
          <V3FieldRow label={`Speed: ${spd.toFixed(2)}x`}>
            <input
              type="range"
              min={0.7}
              max={1.2}
              step={0.05}
              value={spd}
              onChange={(e) => update({ voice_speed: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
          </V3FieldRow>
          <V3FieldRow label="Speaker boost">
            <select
              value={draft.voice_use_speaker_boost ? '1' : '0'}
              onChange={(e) => update({ voice_use_speaker_boost: e.target.value === '1' })}
              style={V3InputStyle}
            >
              <option value="1">on — emphasize voice character</option>
              <option value="0">off</option>
            </select>
          </V3FieldRow>
          <V3FieldRow label={`Temperature: ${temp.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={temp}
              onChange={(e) => update({ llm_temperature: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
          </V3FieldRow>
        </div>
      </div>

      <div style={{ height: 14 }} />
      <div
        style={{
          padding: 14,
          background: 'var(--v3-bg)',
          border: '1px solid var(--v3-line-soft)',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--v3-ink-lo)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 10,
          }}
        >
          Test voice
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <textarea
            rows={2}
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            style={{ ...V3InputStyle, flex: 1, resize: 'vertical', fontSize: 13 }}
          />
          <V3Btn
            kind="primary"
            onClick={previewVoice}
            disabled={previewing || !draft.voice_id}
            icon={<VoicePhone size={12} color="#FFF" />}
          >
            {previewing ? 'Generating…' : 'Preview'}
          </V3Btn>
        </div>
        {audioUrl && (
          <div style={{ marginTop: 12 }}>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
          </div>
        )}
      </div>

      <div style={{ height: 14 }} />
      <V3FieldRow label="Endpointing wait (seconds)">
        <input
          type="number"
          step={0.1}
          value={draft.endpointing_wait_seconds ?? 0.7}
          onChange={(e) =>
            update({ endpointing_wait_seconds: parseFloat(e.target.value) || 0 })
          }
          style={V3InputStyle}
        />
      </V3FieldRow>
    </V3PanelCard>
  );
}
