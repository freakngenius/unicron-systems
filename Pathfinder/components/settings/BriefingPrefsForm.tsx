'use client';

// components/settings/BriefingPrefsForm.tsx — Demo Polish UX Gate 13W-C.
//
// Client form for /pathfinder/settings/briefing. Self-sources the
// operator email from localStorage (`pf_email`) the same way the
// HubspotUserTile does. Loads prefs on mount, persists changes via
// POST /api/briefing/prefs, previews the brief via GET /preview, and
// fires a manual send via POST /dispatch.

import * as React from 'react';

import {
  DEFAULT_BRIEFING_PREFS,
  type BriefingFrequency,
  type BriefingPrefs,
  type BriefingSections,
  type DailyBrief,
} from '@/lib/types';

const SECTION_LABELS: Record<keyof BriefingSections, string> = {
  new_leads: 'Top new leads',
  follow_ups: 'Follow-ups due',
  stage_changes: 'Deal stage changes',
  replies: 'Replies received',
  contacts_pending: 'Contacts pending review',
};

const FREQUENCIES: BriefingFrequency[] = ['daily', 'weekly', 'paused'];

type FormState = {
  frequency: BriefingFrequency;
  send_hour: number;
  timezone: string;
  sections: BriefingSections;
  paused: boolean;
};

function fromPrefs(p: BriefingPrefs | null): FormState {
  const src = p ?? {
    user_id: '',
    ...DEFAULT_BRIEFING_PREFS,
    created_at: '',
    updated_at: '',
  };
  return {
    frequency: src.frequency,
    send_hour: src.send_hour,
    timezone: src.timezone,
    sections: { ...src.sections },
    paused: src.paused,
  };
}

export function BriefingPrefsForm(): React.ReactElement {
  const [operatorEmail, setOperatorEmail] = React.useState<string | null>(null);
  const [state, setState] = React.useState<FormState>(() => fromPrefs(null));
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<DailyBrief | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sentNote, setSentNote] = React.useState<string | null>(null);

  // Self-source operator email from localStorage.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('pf_email');
    if (stored) setOperatorEmail(stored);
  }, []);

  // Load prefs once we have the operator email.
  React.useEffect(() => {
    if (!operatorEmail) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/pathfinder/api/briefing/prefs`, {
      method: 'GET',
      headers: { 'x-operator-email': operatorEmail },
    })
      .then((r) => r.json())
      .then((data: { prefs?: BriefingPrefs; error?: string }) => {
        if (cancelled) return;
        if (data.prefs) setState(fromPrefs(data.prefs));
        if (data.error) setErrorMsg(data.error);
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [operatorEmail]);

  const updateSection = (key: keyof BriefingSections, value: boolean) => {
    setState((s) => ({ ...s, sections: { ...s.sections, [key]: value } }));
    setSavedAt(null);
  };

  const onSave = async () => {
    if (!operatorEmail) {
      setErrorMsg('No operator email — sign in first.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/pathfinder/api/briefing/prefs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-operator-email': operatorEmail,
        },
        body: JSON.stringify(state),
      });
      const data = (await res.json()) as { prefs?: BriefingPrefs; error?: string };
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? `save failed (${res.status})`);
      } else {
        setSavedAt(new Date().toISOString());
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onPreview = async () => {
    if (!operatorEmail) {
      setErrorMsg('No operator email — sign in first.');
      return;
    }
    setPreviewLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/pathfinder/api/briefing/preview`, {
        method: 'GET',
        headers: { 'x-operator-email': operatorEmail },
      });
      const data = (await res.json()) as { brief?: DailyBrief; error?: string };
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? `preview failed (${res.status})`);
      } else if (data.brief) {
        setPreview(data.brief);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const onSendNow = async () => {
    if (!operatorEmail) return;
    setSending(true);
    setSentNote(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`/pathfinder/api/briefing/dispatch`, {
        method: 'POST',
        headers: { 'x-operator-email': operatorEmail },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message_id?: string | null;
        provider?: string | null;
        error?: string;
      };
      if (data.ok) {
        setSentNote(
          `Sent via ${data.provider ?? 'email'}${data.message_id ? ` (${data.message_id.slice(0, 12)}…)` : ''}.`,
        );
      } else if (data.error === 'no_active_integration') {
        setErrorMsg(
          'No connected mailbox. Connect Gmail or Outlook in Settings → Connectors first.',
        );
      } else {
        setErrorMsg(data.error ?? 'send failed');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  if (loading && operatorEmail) {
    return <p>Loading your preferences…</p>;
  }

  if (!operatorEmail) {
    return (
      <p style={{ color: '#a00' }}>
        No operator email found in browser storage. Sign in via the dashboard
        first, then return here.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section style={{ background: '#f7f7f8', padding: 16, borderRadius: 8 }}>
        <strong>Operator:</strong> {operatorEmail}
      </section>

      <fieldset
        style={{ border: '1px solid #e0e0e3', borderRadius: 8, padding: 16 }}
      >
        <legend style={{ fontWeight: 600 }}>Cadence</legend>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          Frequency
          <select
            value={state.frequency}
            onChange={(e) => {
              setState((s) => ({ ...s, frequency: e.target.value as BriefingFrequency }));
              setSavedAt(null);
            }}
            style={{ padding: 6, fontSize: 14 }}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          Send hour (0-23, local)
          <input
            type="number"
            min={0}
            max={23}
            value={state.send_hour}
            onChange={(e) => {
              const v = Number(e.target.value);
              setState((s) => ({
                ...s,
                send_hour: Number.isFinite(v) ? Math.min(23, Math.max(0, Math.floor(v))) : s.send_hour,
              }));
              setSavedAt(null);
            }}
            style={{ width: 80, padding: 6, fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          Timezone (IANA)
          <input
            type="text"
            value={state.timezone}
            onChange={(e) => {
              setState((s) => ({ ...s, timezone: e.target.value }));
              setSavedAt(null);
            }}
            style={{ minWidth: 220, padding: 6, fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={state.paused}
            onChange={(e) => {
              setState((s) => ({ ...s, paused: e.target.checked }));
              setSavedAt(null);
            }}
          />
          Pause briefs (resume by unchecking)
        </label>
      </fieldset>

      <fieldset
        style={{ border: '1px solid #e0e0e3', borderRadius: 8, padding: 16 }}
      >
        <legend style={{ fontWeight: 600 }}>Sections</legend>
        {(Object.keys(SECTION_LABELS) as Array<keyof BriefingSections>).map((key) => (
          <label
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}
          >
            <input
              type="checkbox"
              checked={state.sections[key]}
              onChange={(e) => updateSection(key, e.target.checked)}
            />
            {SECTION_LABELS[key]}
          </label>
        ))}
      </fieldset>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={primaryButtonStyle(saving)}
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
        <button
          type="button"
          onClick={onPreview}
          disabled={previewLoading}
          style={secondaryButtonStyle(previewLoading)}
        >
          {previewLoading ? 'Composing…' : 'Preview'}
        </button>
        <button
          type="button"
          onClick={onSendNow}
          disabled={sending}
          style={secondaryButtonStyle(sending)}
        >
          {sending ? 'Sending…' : 'Send me one now'}
        </button>
        {savedAt && <span style={{ color: '#0a7d2c' }}>Saved.</span>}
        {sentNote && <span style={{ color: '#0a7d2c' }}>{sentNote}</span>}
        {errorMsg && <span style={{ color: '#a00' }}>{errorMsg}</span>}
      </div>

      {preview && (
        <section
          style={{
            border: '1px solid #e0e0e3',
            borderRadius: 8,
            padding: 16,
            background: '#fff',
          }}
        >
          <h2 style={{ fontSize: 18, marginTop: 0 }}>Preview</h2>
          <p style={{ color: '#444', margin: '4px 0 12px' }}>
            <strong>Subject:</strong> {preview.subject}
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-monospace,SF Mono,Menlo,monospace',
              fontSize: 13,
              background: '#f7f7f8',
              padding: 12,
              borderRadius: 6,
            }}
          >
            {preview.markdown}
          </pre>
        </section>
      )}
    </div>
  );
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#7a8'
      : '#1f6feb',
    color: '#fff',
    padding: '8px 14px',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    background: '#fff',
    color: disabled ? '#888' : '#1a1a1a',
    padding: '8px 14px',
    border: '1px solid #c8c8cd',
    borderRadius: 6,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
