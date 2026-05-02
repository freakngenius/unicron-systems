'use client';

// RoutingRulesModal — connector routing rule editor.
//
// Lists existing rules for one connector, lets the operator add a new
// rule, edit / delete an existing rule, or fire a synthetic test event.
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 3.6 + 4.4.
//
// Channel autocomplete is opportunistic — if C-1B exposes
// /api/connectors/slack/channels/list we use it; otherwise we degrade
// gracefully to a free-text input with a hint message.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import { EVENT_TYPES } from '@/lib/connectors/events';
import { validateRoutingRule, type ValidationError } from '@/lib/connectors/rules-validate';
import type { ConnectorRoutingRule } from '@/lib/types';
import { getUserEmail } from '@/lib/settings';
import type { ConnectorId } from './ConnectorTile';

const API_BASE = '/pathfinder/api';

interface RoutingRulesModalProps {
  connectorId: string;
  connectorType: ConnectorId;
  onClose: () => void;
}

interface DraftRule {
  event_type: string;
  channel_id: string;
  channel_name: string;
  filter_json_text: string;
  quiet_hours_enabled: boolean;
  weekdays_enabled: boolean;
  weekends_enabled: boolean;
  start_hour_utc: string;
  end_hour_utc: string;
}

const EMPTY_DRAFT: DraftRule = {
  event_type: '',
  channel_id: '',
  channel_name: '',
  filter_json_text: '',
  quiet_hours_enabled: false,
  weekdays_enabled: true,
  weekends_enabled: false,
  start_hour_utc: '13',
  end_hour_utc: '23',
};

export function RoutingRulesModal(props: RoutingRulesModalProps) {
  const { connectorId, connectorType, onClose } = props;
  const [rules, setRules] = React.useState<ConnectorRoutingRule[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<DraftRule>({ ...EMPTY_DRAFT });
  const [errors, setErrors] = React.useState<ValidationError[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [channelOptions, setChannelOptions] = React.useState<{ id: string; name: string }[] | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/connectors/instances/${connectorId}/rules`, {
          headers: operatorHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) {
          const json = await safeJson(res);
          if (!cancelled) setLoadError(`Couldn't load rules — ${json?.error ?? res.status}`);
        } else {
          const json = (await res.json()) as { rules: ConnectorRoutingRule[] };
          if (!cancelled) setRules(json.rules ?? []);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [connectorId]);

  // Best-effort channel autocomplete (Slack only). Fail silently — the
  // text input is a perfectly valid fallback and the v1 SPEC explicitly
  // calls this a Phase 1 simplification.
  React.useEffect(() => {
    if (connectorType !== 'slack') return;
    let cancelled = false;
    fetch(`${API_BASE}/connectors/slack/channels/list?org_id=zedcor`, {
      headers: operatorHeaders(),
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { channels?: { id: string; name: string }[] };
        if (!cancelled && json.channels?.length) setChannelOptions(json.channels);
      })
      .catch(() => {
        // expected when C-1B isn't deployed yet
      });
    return () => {
      cancelled = true;
    };
  }, [connectorType]);

  const onSubmitDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = draftToPayload(draft);
    const validation = validateRoutingRule(payload);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/connectors/instances/${connectorId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...operatorHeaders() },
        body: JSON.stringify(payload),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        setErrors(
          (json?.errors as ValidationError[] | undefined) ?? [
            { field: '_root', message: `${json?.error ?? res.status}` },
          ],
        );
        return;
      }
      const created = json?.rule as ConnectorRoutingRule | undefined;
      setRules((prev) => (created ? [...(prev ?? []), created] : prev));
      setDraft({ ...EMPTY_DRAFT });
    } catch (err) {
      setErrors([{ field: '_root', message: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (ruleId: string) => {
    const res = await fetch(`${API_BASE}/connectors/instances/${connectorId}/rules/${ruleId}`, {
      method: 'DELETE',
      headers: operatorHeaders(),
    });
    if (res.ok) {
      setRules((prev) => (prev ? prev.filter((r) => r.id !== ruleId) : prev));
    }
  };

  const onTest = async (rule: ConnectorRoutingRule) => {
    setTestingId(rule.id);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/connectors/instances/${connectorId}/rules/${rule.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...operatorHeaders() },
      });
      const json = await safeJson(res);
      if (json?.dispatched) {
        setTestResult(`✓ Dispatched test event to ${rule.channel_id}.`);
      } else {
        setTestResult(`Logged test attempt. ${json?.note ?? json?.error ?? 'Dispatcher not yet wired.'}`);
      }
    } catch (err) {
      setTestResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="routing-rules-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,10,10,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="routing-rules-modal"
        style={{
          background: PF_TINTS.bg,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: PF_TINTS.r.md,
          boxShadow: PF_TINTS.shadow.lg,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
          font: `400 13px/1.5 ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <h2
            id="routing-rules-title"
            style={{ font: `600 16px/1.3 ${PF_TINTS.sans}`, margin: '0 0 4px' }}
          >
            Routing rules · {connectorType}
          </h2>
          <p
            className="pf-mono"
            style={{
              fontSize: 9,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: PF_TINTS.inkDim,
              margin: 0,
            }}
          >
            connector / {connectorId.slice(0, 8)}
          </p>
        </header>

        <section style={{ marginBottom: 24 }}>
          <h3 style={{ font: `500 13px ${PF_TINTS.sans}`, margin: '0 0 8px' }}>Active rules</h3>
          {loading && <p style={{ color: PF_TINTS.inkDim, margin: 0 }}>Loading…</p>}
          {loadError && <p style={{ color: '#c42424', margin: 0 }}>{loadError}</p>}
          {!loading && rules && rules.length === 0 && (
            <p style={{ color: PF_TINTS.inkDim, margin: 0, fontStyle: 'italic' }}>
              No active rules. Add one below.
            </p>
          )}
          {rules && rules.length > 0 && (
            <ul
              data-testid="routing-rules-list"
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  data-testid={`routing-rule-${rule.id}`}
                  style={{
                    border: `1px solid ${PF_TINTS.ruleSoft}`,
                    borderRadius: 4,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `500 12px ${PF_TINTS.sans}` }}>{rule.event_type}</div>
                    <div
                      className="pf-mono"
                      style={{ fontSize: 10, color: PF_TINTS.inkDim }}
                    >
                      → {rule.channel_id}
                      {rule.channel_name ? ` (${rule.channel_name})` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTest(rule)}
                    disabled={testingId === rule.id}
                    data-testid={`routing-rule-${rule.id}-test`}
                    style={smallSecondaryBtn()}
                  >
                    {testingId === rule.id ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(rule.id)}
                    data-testid={`routing-rule-${rule.id}-delete`}
                    style={smallSecondaryBtn()}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          {testResult && (
            <p
              data-testid="routing-rule-test-result"
              style={{
                marginTop: 8,
                color: PF_TINTS.inkSub,
                fontSize: 12,
                fontStyle: 'italic',
              }}
            >
              {testResult}
            </p>
          )}
        </section>

        <form onSubmit={onSubmitDraft} data-testid="routing-rules-add-form">
          <h3 style={{ font: `500 13px ${PF_TINTS.sans}`, margin: '0 0 8px' }}>Add a rule</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={fieldLabel()}>Event type</span>
              <select
                data-testid="routing-rule-event-type"
                value={draft.event_type}
                onChange={(e) => setDraft({ ...draft, event_type: e.target.value })}
                style={fieldStyle()}
              >
                <option value="">Pick an event…</option>
                {EVENT_TYPES.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={fieldLabel()}>Channel</span>
              {channelOptions ? (
                <select
                  data-testid="routing-rule-channel-select"
                  value={draft.channel_id}
                  onChange={(e) => {
                    const opt = channelOptions.find((c) => c.id === e.target.value);
                    setDraft({
                      ...draft,
                      channel_id: e.target.value,
                      channel_name: opt?.name ?? draft.channel_name,
                    });
                  }}
                  style={fieldStyle()}
                >
                  <option value="">Pick a channel…</option>
                  {channelOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  data-testid="routing-rule-channel-input"
                  placeholder="#channel-name"
                  value={draft.channel_id}
                  onChange={(e) => setDraft({ ...draft, channel_id: e.target.value })}
                  style={fieldStyle()}
                />
              )}
              {!channelOptions && connectorType === 'slack' && (
                <span style={{ fontSize: 10, color: PF_TINTS.inkDim, marginTop: 2 }}>
                  Channel autocomplete arrives once the Slack app has channels:read scope.
                </span>
              )}
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            <span style={fieldLabel()}>Filter (JSON)</span>
            <textarea
              data-testid="routing-rule-filter-json"
              rows={4}
              placeholder={`{ "branch_id": "denver", "min_score": 90 }`}
              value={draft.filter_json_text}
              onChange={(e) => setDraft({ ...draft, filter_json_text: e.target.value })}
              style={{
                ...fieldStyle(),
                font: `400 11px/1.4 ${PF_TINTS.mono}`,
                resize: 'vertical',
              }}
            />
            <span style={{ fontSize: 10, color: PF_TINTS.inkDim }}>
              Examples: {'{ "branch_id": "denver" }'} · {'{ "min_score": 90 }'} · {'{ "customer_id": "acme" }'}
            </span>
          </label>

          <div
            style={{
              border: `1px solid ${PF_TINTS.ruleSoft}`,
              borderRadius: 4,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                data-testid="routing-rule-quiet-hours-toggle"
                checked={draft.quiet_hours_enabled}
                onChange={(e) =>
                  setDraft({ ...draft, quiet_hours_enabled: e.target.checked })
                }
              />
              <span style={fieldLabel()}>Quiet hours (UTC)</span>
            </label>
            {draft.quiet_hours_enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={draft.weekdays_enabled}
                    onChange={(e) => setDraft({ ...draft, weekdays_enabled: e.target.checked })}
                  />
                  <span style={{ fontSize: 11 }}>Weekdays</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={draft.weekends_enabled}
                    onChange={(e) => setDraft({ ...draft, weekends_enabled: e.target.checked })}
                  />
                  <span style={{ fontSize: 11 }}>Weekends</span>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: PF_TINTS.inkDim }}>Start (0-23)</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={draft.start_hour_utc}
                    onChange={(e) => setDraft({ ...draft, start_hour_utc: e.target.value })}
                    style={fieldStyle()}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: PF_TINTS.inkDim }}>End (0-23)</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={draft.end_hour_utc}
                    onChange={(e) => setDraft({ ...draft, end_hour_utc: e.target.value })}
                    style={fieldStyle()}
                  />
                </label>
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <ul
              data-testid="routing-rules-errors"
              style={{
                listStyle: 'none',
                padding: 8,
                margin: '0 0 12px',
                color: '#c42424',
                fontSize: 12,
                background: 'rgba(196,36,36,0.06)',
                border: '1px solid rgba(196,36,36,0.4)',
                borderRadius: 4,
              }}
            >
              {errors.map((err, i) => (
                <li key={`${err.field}-${i}`}>
                  <strong>{err.field}:</strong> {err.message}
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onClose}
              style={smallSecondaryBtn()}
              data-testid="routing-rules-close"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="routing-rule-save"
              style={{
                font: `500 12px ${PF_TINTS.sans}`,
                color: PF_TINTS.bg,
                background: PF_TINTS.ink,
                border: `1px solid ${PF_TINTS.ink}`,
                borderRadius: 3,
                padding: '8px 16px',
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Saving…' : 'Save rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function draftToPayload(draft: DraftRule): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event_type: draft.event_type,
    channel_id: draft.channel_id,
    channel_name: draft.channel_name || null,
    filter_json: draft.filter_json_text.trim() === '' ? {} : draft.filter_json_text,
  };
  if (draft.quiet_hours_enabled) {
    payload.quiet_hours_json = {
      weekdays_enabled: draft.weekdays_enabled,
      weekends_enabled: draft.weekends_enabled,
      start_hour_utc: Number(draft.start_hour_utc),
      end_hour_utc: Number(draft.end_hour_utc),
    };
  }
  return payload;
}

function operatorHeaders(): Record<string, string> {
  const email = getUserEmail();
  if (email) return { 'x-operator-email': email };
  return {};
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fieldStyle(): React.CSSProperties {
  return {
    background: PF_TINTS.bgAlt,
    border: `1px solid ${PF_TINTS.ruleSoft}`,
    borderRadius: 3,
    padding: '6px 8px',
    color: PF_TINTS.ink,
    font: `400 12px ${PF_TINTS.sans}`,
    outline: 'none',
  };
}

function fieldLabel(): React.CSSProperties {
  return {
    fontSize: 10,
    color: PF_TINTS.inkDim,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 500,
  };
}

function smallSecondaryBtn(): React.CSSProperties {
  return {
    font: `500 11px ${PF_TINTS.sans}`,
    color: PF_TINTS.inkSub,
    background: 'transparent',
    border: `1px solid ${PF_TINTS.ruleSoft}`,
    borderRadius: 3,
    padding: '4px 10px',
    cursor: 'pointer',
  };
}
