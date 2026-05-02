'use client';

// components/settings/connectors/HubspotMappingForm.tsx — Demo Polish UX
// Gate 4B-2. Customer-facing form for editing
// `pathfinder.connectors.metadata.hubspot_mapping`. Renders 3 sections:
// deal fields, contact fields, stage map. Per-row conflict-policy
// dropdown.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import {
  CONFLICT_POLICIES,
  type ConflictPolicy,
  type FieldMapping,
  type HubspotMappingConfig,
  type StageMapping,
} from '@/lib/connectors/hubspot/mapping';

interface Props {
  initial: HubspotMappingConfig;
  connectorPresent: boolean;
}

interface Saved {
  mapping: HubspotMappingConfig;
}

const POLICY_LABEL: Record<ConflictPolicy, string> = {
  last_write_wins: 'Last write wins',
  pathfinder_locked: 'Pathfinder locked',
  hubspot_locked: 'HubSpot locked',
};

export function HubspotMappingForm({ initial, connectorPresent }: Props): React.ReactElement {
  const [dealFields, setDealFields] = React.useState<FieldMapping[]>(initial.deal_fields);
  const [contactFields, setContactFields] = React.useState<FieldMapping[]>(initial.contact_fields);
  const [stageMap, setStageMap] = React.useState<StageMapping[]>(initial.stage_map);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  async function onSave() {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/pathfinder/api/connectors/hubspot/mapping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mapping: {
            deal_fields: dealFields,
            contact_fields: contactFields,
            stage_map: stageMap,
          },
        }),
      });
      const json = (await res.json()) as Saved | { error?: string; details?: string[] };
      if (!res.ok) {
        const errMsg = ('error' in json ? json.error : 'save_failed') ?? 'save_failed';
        setFeedback({ kind: 'err', message: errMsg });
      } else {
        setFeedback({ kind: 'ok', message: 'Mapping saved.' });
      }
    } catch (err) {
      setFeedback({ kind: 'err', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!connectorPresent && (
        <div
          style={{
            background: 'rgba(196,36,36,0.08)',
            border: '1px solid rgba(196,36,36,0.30)',
            color: '#7a1a1a',
            padding: '10px 14px',
            borderRadius: 4,
            font: `500 12px ${PF_TINTS.sans}`,
          }}
        >
          HubSpot is not connected yet. Connect from <code>/pathfinder/settings/connectors</code>;
          mapping changes here apply on first sync after connection.
        </div>
      )}

      <Section title="Deal field mapping" description="Pathfinder fields that mirror to HubSpot deal properties.">
        <FieldTable rows={dealFields} setRows={setDealFields} />
      </Section>

      <Section title="Contact field mapping" description="Pathfinder contact fields that mirror to HubSpot contact properties.">
        <FieldTable rows={contactFields} setRows={setContactFields} />
      </Section>

      <Section title="Stage mapping" description="Pathfinder pipeline stages that mirror to HubSpot deal stages. Use the stage IDs from your HubSpot pipeline (e.g. `appointmentscheduled`).">
        <StageTable rows={stageMap} setRows={setStageMap} />
      </Section>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 0',
        }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          data-testid="hubspot-mapping-save"
          style={{
            font: `500 13px ${PF_TINTS.sans}`,
            color: PF_TINTS.bg,
            background: saving ? PF_TINTS.inkDim : PF_TINTS.ink,
            border: `1px solid ${PF_TINTS.ink}`,
            borderRadius: 4,
            padding: '8px 16px',
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save mapping'}
        </button>
        {feedback && (
          <span
            style={{
              font: `500 12px ${PF_TINTS.sans}`,
              color: feedback.kind === 'ok' ? '#198754' : '#c42424',
            }}
          >
            {feedback.message}
          </span>
        )}
      </footer>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 18,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, font: `600 14px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>{title}</h3>
        <div style={{ marginTop: 2, font: `400 12px ${PF_TINTS.sans}`, color: PF_TINTS.inkSub }}>
          {description}
        </div>
      </header>
      {children}
    </section>
  );
}

interface FieldTableProps {
  rows: FieldMapping[];
  setRows: React.Dispatch<React.SetStateAction<FieldMapping[]>>;
}

function FieldTable({ rows, setRows }: FieldTableProps): React.ReactElement {
  function update(idx: number, patch: Partial<FieldMapping>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Header columns={['Pathfinder field', 'HubSpot property', 'Conflict policy']} />
      {rows.map((row, i) => (
        <div key={`${row.pathfinder_field}-${i}`} style={rowStyle}>
          <input
            value={row.pathfinder_field}
            onChange={(e) => update(i, { pathfinder_field: e.target.value })}
            data-testid={`field-pf-${i}`}
            style={inputStyle}
          />
          <input
            value={row.hubspot_property}
            onChange={(e) => update(i, { hubspot_property: e.target.value })}
            data-testid={`field-hs-${i}`}
            style={inputStyle}
          />
          <select
            value={row.conflict_policy}
            onChange={(e) => update(i, { conflict_policy: e.target.value as ConflictPolicy })}
            data-testid={`field-policy-${i}`}
            style={selectStyle}
          >
            {CONFLICT_POLICIES.map((p) => (
              <option key={p} value={p}>
                {POLICY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

interface StageTableProps {
  rows: StageMapping[];
  setRows: React.Dispatch<React.SetStateAction<StageMapping[]>>;
}

function StageTable({ rows, setRows }: StageTableProps): React.ReactElement {
  function update(idx: number, patch: Partial<StageMapping>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Header columns={['Pathfinder stage', 'HubSpot stage id', 'Conflict policy']} />
      {rows.map((row, i) => (
        <div key={row.pathfinder_stage} style={rowStyle}>
          <span style={{ ...inputStyle, background: PF_TINTS.bgAlt, color: PF_TINTS.inkSub, alignContent: 'center' }}>
            {row.pathfinder_stage}
          </span>
          <input
            value={row.hubspot_stage_id}
            placeholder="appointmentscheduled / 12345 / …"
            onChange={(e) => update(i, { hubspot_stage_id: e.target.value })}
            data-testid={`stage-hs-${i}`}
            style={inputStyle}
          />
          <select
            value={row.conflict_policy}
            onChange={(e) => update(i, { conflict_policy: e.target.value as ConflictPolicy })}
            data-testid={`stage-policy-${i}`}
            style={selectStyle}
          >
            {CONFLICT_POLICIES.map((p) => (
              <option key={p} value={p}>
                {POLICY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 180px',
  gap: 8,
  alignItems: 'center',
};

const inputStyle: React.CSSProperties = {
  font: `400 12px ${PF_TINTS.mono}`,
  color: PF_TINTS.ink,
  background: PF_TINTS.bg,
  border: `1px solid ${PF_TINTS.ruleSoft}`,
  borderRadius: 3,
  padding: '6px 10px',
  width: '100%',
};

const selectStyle: React.CSSProperties = {
  font: `400 12px ${PF_TINTS.sans}`,
  color: PF_TINTS.ink,
  background: PF_TINTS.bg,
  border: `1px solid ${PF_TINTS.ruleSoft}`,
  borderRadius: 3,
  padding: '6px 10px',
};

function Header({ columns }: { columns: string[] }): React.ReactElement {
  return (
    <div style={{ ...rowStyle, marginBottom: 4 }}>
      {columns.map((c) => (
        <div
          key={c}
          style={{
            font: `600 10px ${PF_TINTS.sans}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: PF_TINTS.inkDim,
          }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}
