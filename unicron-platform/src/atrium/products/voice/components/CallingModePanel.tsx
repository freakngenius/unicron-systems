// CallingModePanel — three-card mode switcher (Allowlist / HubSpot / Open)
// with phone editor (E.164 normalize, add/remove pills, bulk paste), HubSpot
// filter form (pipeline_id / stage_ids / list_id), and an Open-mode typed-name
// confirmation modal that PATCHes /api/voice/sources/{id}/allowlist with
// { mode: 'open', confirm_open: true, confirmed_by }.
//
// Translated from prototype src/app/agents/page.tsx CallingModePanel region
// (lines 727–1247). Atrium delta:
//   - Imports normalizeE164 from src/lib/voice/allowlist (canonical Atrium
//     copy, byte-identical to prototype's inline version).
//   - Uses voiceFetch to attach the bearer JWT.
//   - CSS vars translated: --v3-border → --v3-line-strong, --v3-bg-sub →
//     --v3-bg-soft (matches Atrium's voice-v3.css palette).
//   - Endpoint base /api/voice-sources/... → /api/voice/sources/...

import { useState } from 'react';
import type { ReactNode } from 'react';
import { I } from './icons';
import {
  V3PanelCard,
  V3StatusPill,
  V3FieldRow,
  V3InputStyle,
  V3Btn,
} from './v3primitives';
import { normalizeE164 } from '../../../../lib/voice/allowlist';
import { voiceFetch } from '../../../lib/voiceFetch';

export type CallingModeSource = {
  id?: string | null;
  source_name: string;
  allowlist_mode?: 'allowlist' | 'hubspot' | 'open' | null;
  allowlist_phones?: string[] | null;
  hubspot_filter?: {
    pipeline_id?: string | null;
    stage_ids?: string[] | null;
    list_id?: string | null;
  } | null;
  open_mode_confirmed_by?: string | null;
  open_mode_confirmed_at?: string | null;
};

export function CallingModePanel({
  draft,
  update,
}: {
  draft: CallingModeSource;
  update: (patch: Partial<CallingModeSource>) => void;
}) {
  const mode: 'allowlist' | 'hubspot' | 'open' =
    (draft.allowlist_mode as 'allowlist' | 'hubspot' | 'open' | null) ?? 'allowlist';
  const [pasting, setPasting] = useState('');
  const [openTypedName, setOpenTypedName] = useState('');
  const [openModeDialog, setOpenModeDialog] = useState(false);
  const [savingOpen, setSavingOpen] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);

  const phones = draft.allowlist_phones ?? [];
  const hf = draft.hubspot_filter ?? {};

  function setMode(next: 'allowlist' | 'hubspot' | 'open') {
    if (next === 'open') {
      setOpenTypedName('');
      setOpenErr(null);
      setOpenModeDialog(true);
      return;
    }
    update({ allowlist_mode: next });
  }

  async function confirmOpenMode() {
    if (openTypedName.trim() !== draft.source_name.trim()) {
      setOpenErr('Typed name does not match agent name.');
      return;
    }
    if (!draft.id) {
      update({
        allowlist_mode: 'open',
        open_mode_confirmed_by: 'local',
        open_mode_confirmed_at: new Date().toISOString(),
      });
      setOpenModeDialog(false);
      return;
    }
    setSavingOpen(true);
    setOpenErr(null);
    try {
      const r = await voiceFetch(`/api/voice/sources/${draft.id}/allowlist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'open',
          confirm_open: true,
          confirmed_by: 'atrium-ui',
        }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        open_mode_confirmed_by?: string;
        open_mode_confirmed_at?: string;
      };
      if (!r.ok || !j.ok) throw new Error(j.error || 'Failed to enable Open mode');
      update({
        allowlist_mode: 'open',
        open_mode_confirmed_by: j.open_mode_confirmed_by ?? 'atrium-ui',
        open_mode_confirmed_at: j.open_mode_confirmed_at ?? new Date().toISOString(),
      });
      setOpenModeDialog(false);
    } catch (e) {
      setOpenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingOpen(false);
    }
  }

  function addPhone(raw: string) {
    const e = normalizeE164(raw);
    if (!e) return;
    if (phones.includes(e)) return;
    update({ allowlist_phones: [...phones, e] });
  }

  function removePhone(p: string) {
    update({ allowlist_phones: phones.filter((x) => x !== p) });
  }

  function bulkPaste() {
    const lines = pasting
      .split(/[\n,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const normalized = lines
      .map(normalizeE164)
      .filter((x): x is string => !!x && x.length > 0);
    const merged = Array.from(new Set([...phones, ...normalized]));
    update({ allowlist_phones: merged });
    setPasting('');
  }

  const modeTone: Record<typeof mode, 'ok' | 'info' | 'warn'> = {
    allowlist: 'ok',
    hubspot: 'info',
    open: 'warn',
  };
  const modeLabel: Record<typeof mode, string> = {
    allowlist: 'Allowlist only',
    hubspot: 'HubSpot contacts',
    open: 'Open (no filter)',
  };

  return (
    <V3PanelCard
      title="Calling mode"
      subtitle="Controls which phone numbers this agent is allowed to dial"
      action={<V3StatusPill tone={modeTone[mode]}>{modeLabel[mode]}</V3StatusPill>}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <ModeCard
          active={mode === 'allowlist'}
          title="Allowlist"
          desc="Only numbers in the list below can be dialed. Safest default."
          icon={<I.Shield size={14} />}
          tone="ok"
          onClick={() => setMode('allowlist')}
        />
        <ModeCard
          active={mode === 'hubspot'}
          title="HubSpot"
          desc="Allow any HubSpot contact, optionally filtered by pipeline/stage or list."
          icon={<I.Lock size={14} />}
          tone="info"
          onClick={() => setMode('hubspot')}
        />
        <ModeCard
          active={mode === 'open'}
          title="Open"
          desc="No allowlist filter. Agent can dial anything its prompt picks. Requires typed confirmation."
          icon={<I.Unlock size={14} />}
          tone="warn"
          onClick={() => setMode('open')}
        />
      </div>

      {mode === 'allowlist' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--v3-ink-lo)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Allowed numbers ({phones.length})
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              maxHeight: 180,
              overflowY: 'auto',
              padding: phones.length ? 8 : 0,
              border: phones.length ? '1px solid var(--v3-line-strong)' : 'none',
              borderRadius: 8,
            }}
          >
            {phones.map((p) => (
              <span
                key={p}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--v3-bg-soft)',
                  border: '1px solid var(--v3-line-strong)',
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontFamily: 'ui-monospace, Menlo, monospace',
                }}
              >
                {p}
                <button
                  type="button"
                  onClick={() => removePhone(p)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--v3-ink-lo)',
                    cursor: 'pointer',
                    fontSize: 13,
                    lineHeight: 1,
                  }}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
            {phones.length === 0 && (
              <span style={{ color: 'var(--v3-ink-lo)', fontSize: 12 }}>
                No numbers yet. Add one below.
              </span>
            )}
          </div>
          <AddPhoneRow onAdd={addPhone} />
          <V3FieldRow label="Bulk paste (one per line or comma-separated)">
            <textarea
              rows={3}
              value={pasting}
              onChange={(e) => setPasting(e.target.value)}
              placeholder={'+14253014258\n4255551234\n(425) 555-9999'}
              style={{
                ...V3InputStyle,
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 12,
              }}
            />
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <V3Btn kind="ghost" onClick={bulkPaste}>
                Add all
              </V3Btn>
              {pasting && (
                <V3Btn kind="ghost" onClick={() => setPasting('')}>
                  Clear
                </V3Btn>
              )}
            </div>
          </V3FieldRow>
        </div>
      )}

      {mode === 'hubspot' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--v3-ink-lo)', lineHeight: 1.5 }}>
            Agent can dial any HubSpot contact whose phone resolves to a match.
            Optionally restrict to a deal pipeline + stages, or a static contact list.
            Leave all fields blank for any HubSpot contact.
          </div>
          <V3FieldRow label="HubSpot deal pipeline ID (optional)">
            <input
              value={hf.pipeline_id ?? ''}
              onChange={(e) =>
                update({
                  hubspot_filter: { ...hf, pipeline_id: e.target.value || null },
                })
              }
              placeholder="e.g. default"
              style={V3InputStyle}
            />
          </V3FieldRow>
          <V3FieldRow label="Stage IDs (comma separated, optional)">
            <input
              value={(hf.stage_ids ?? []).join(', ')}
              onChange={(e) =>
                update({
                  hubspot_filter: {
                    ...hf,
                    stage_ids: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })
              }
              placeholder="appointmentscheduled, qualifiedtobuy"
              style={V3InputStyle}
            />
          </V3FieldRow>
          <V3FieldRow label="OR Contact list ID (optional, overrides pipeline filter)">
            <input
              value={hf.list_id ?? ''}
              onChange={(e) =>
                update({
                  hubspot_filter: { ...hf, list_id: e.target.value || null },
                })
              }
              placeholder="e.g. 412"
              style={V3InputStyle}
            />
          </V3FieldRow>
          <div
            style={{
              fontSize: 11,
              color: 'var(--v3-ink-lo)',
              padding: 8,
              background: 'var(--v3-bg-soft)',
              borderRadius: 6,
            }}
          >
            Phone match runs against HubSpot's <code>phone</code> and{' '}
            <code>mobilephone</code> properties, normalized to digits. Lookup is
            cached 60 seconds per filter.
          </div>
        </div>
      )}

      {mode === 'open' && (
        <div
          style={{
            fontSize: 12,
            padding: 12,
            background: 'rgba(232, 158, 58, 0.10)',
            border: '1px solid rgba(232, 158, 58, 0.35)',
            borderRadius: 8,
            color: 'var(--v3-ink)',
            lineHeight: 1.5,
          }}
        >
          <strong>Open mode is active.</strong> This agent is not restricted to
          an allowlist or HubSpot. Only the global env circuit breaker still
          applies. Confirmed by{' '}
          <code>{draft.open_mode_confirmed_by || 'unknown'}</code> at{' '}
          <code>
            {draft.open_mode_confirmed_at
              ? new Date(draft.open_mode_confirmed_at).toLocaleString()
              : 'unknown'}
          </code>
          .
        </div>
      )}

      {openModeDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => !savingOpen && setOpenModeDialog(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--v3-surface)',
              border: '1px solid var(--v3-line-strong)',
              borderRadius: 12,
              padding: 22,
              width: 460,
              boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 8,
                color: 'var(--v3-ink)',
              }}
            >
              Enable Open mode for this agent?
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--v3-ink-lo)',
                lineHeight: 1.5,
                marginBottom: 14,
              }}
            >
              Open mode removes the per-agent allowlist and HubSpot filter.
              The agent can dial any number its prompt or upstream research
              picks. Only the global env circuit breaker still applies. Type
              the agent name to confirm.
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--v3-ink-lo)',
                marginBottom: 6,
                fontFamily: 'ui-monospace, Menlo, monospace',
              }}
            >
              Expected: <strong>{draft.source_name}</strong>
            </div>
            <input
              autoFocus
              value={openTypedName}
              onChange={(e) => setOpenTypedName(e.target.value)}
              placeholder="Type agent name to confirm"
              style={{ ...V3InputStyle, width: '100%' }}
            />
            {openErr && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: 'var(--v3-red)',
                }}
              >
                {openErr}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 16,
              }}
            >
              <V3Btn kind="ghost" onClick={() => setOpenModeDialog(false)}>
                Cancel
              </V3Btn>
              <V3Btn kind="primary" onClick={confirmOpenMode} disabled={savingOpen}>
                {savingOpen ? 'Enabling…' : 'Enable Open mode'}
              </V3Btn>
            </div>
          </div>
        </div>
      )}
    </V3PanelCard>
  );
}

function ModeCard({
  active,
  title,
  desc,
  icon,
  tone,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  icon: ReactNode;
  tone: 'ok' | 'info' | 'warn';
  onClick: () => void;
}) {
  const accent =
    tone === 'ok'
      ? 'var(--v3-green)'
      : tone === 'warn'
        ? 'var(--v3-orange)'
        : 'var(--v3-blue)';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 12,
        borderRadius: 10,
        border: active ? `1.5px solid ${accent}` : '1px solid var(--v3-line-strong)',
        background: active ? 'var(--v3-surface)' : 'var(--v3-bg-soft)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: accent }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--v3-ink)' }}>
          {title}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--v3-ink-lo)', lineHeight: 1.4 }}>
        {desc}
      </div>
    </button>
  );
}

function AddPhoneRow({ onAdd }: { onAdd: (raw: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onAdd(val);
            setVal('');
          }
        }}
        placeholder="+14253014258 or (425) 301-4258"
        style={{ ...V3InputStyle, flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}
      />
      <V3Btn
        kind="ghost"
        onClick={() => {
          onAdd(val);
          setVal('');
        }}
      >
        Add
      </V3Btn>
    </div>
  );
}
