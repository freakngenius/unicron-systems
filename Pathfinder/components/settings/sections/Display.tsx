'use client';

// Display section — user-facing dashboard preferences.
//
// Lead-cost toggle is gated behind operator role per the spec. Customers
// don't see the toggle; the underlying setting stays false for them.
// Other prefs are visible to everyone.
//
// Per-section save: changes accumulate locally; user clicks "Save" to
// persist. Dashboards reading via useSettings() update on save.

import * as React from 'react';

import {
  DEFAULT_SETTINGS,
  PathfinderSettings,
  SortMode,
  TimeRange,
  updateSettings,
  useIsOperator,
  useSettings,
} from '@/lib/settings';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { Button, Card, Row, Select, Toggle } from '../Field';

export function DisplaySection() {
  const persisted = useSettings();
  const isOperator = useIsOperator();
  const [draft, setDraft] = React.useState<PathfinderSettings>(persisted);

  // Re-sync the draft when persisted state changes externally (cross-tab).
  React.useEffect(() => setDraft(persisted), [persisted]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(persisted);

  const onSave = () => {
    updateSettings(draft);
  };
  const onReset = () => {
    setDraft(persisted);
  };

  return (
    <Card
      title="Display"
      description="Dashboard preferences. Saved per-browser via localStorage; cross-tab updates are picked up automatically."
      footer={
        <>
          <Button variant="ghost" onClick={onReset} disabled={!dirty}>
            Reset
          </Button>
          <Button onClick={onSave} disabled={!dirty}>
            Save display preferences
          </Button>
        </>
      }
    >
      {isOperator && (
        <Row
          label={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Show lead cost
              <span
                className="pf-mono"
                style={{
                  fontSize: 9,
                  color: '#9d35ff',
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  border: `1px solid ${hexAlpha('#9d35ff', 0.45)}`,
                  borderRadius: 2,
                }}
              >
                operator
              </span>
            </span>
          }
          hint="When on, the multi-model routing strip shows per-model cost columns plus the cumulative total + per-ranked-lead figures. Customers never see this toggle."
        >
          <Toggle
            checked={draft.showLeadCost}
            onChange={(next) => setDraft({ ...draft, showLeadCost: next })}
            label="Show lead cost"
          />
        </Row>
      )}

      <Row
        label="Default time range"
        hint="Time window the dashboard counters reflect on first load."
      >
        <Select<TimeRange>
          value={draft.defaultTimeRange}
          onChange={(next) => setDraft({ ...draft, defaultTimeRange: next })}
          options={[
            { value: '6h', label: '6 hours' },
            { value: '24h', label: '24 hours' },
            { value: '7d', label: '7 days' },
            { value: '30d', label: '30 days' },
          ]}
        />
      </Row>

      <Row
        label="Default sort order"
        hint="Initial ordering on the right-rail project list."
      >
        <Select<SortMode>
          value={draft.defaultSort}
          onChange={(next) => setDraft({ ...draft, defaultSort: next })}
          options={[
            { value: 'score', label: 'Score' },
            { value: 'distance', label: 'Distance' },
            { value: 'posted', label: 'Posted' },
            { value: 'recent', label: 'Most recent' },
          ]}
        />
      </Row>

      <Row
        label="Cross-pollination view default"
        hint="Show customer markers + warm-intro polylines on first load."
      >
        <Toggle
          checked={draft.crossPollDefault}
          onChange={(next) => setDraft({ ...draft, crossPollDefault: next })}
          label="Cross-pollination default"
        />
      </Row>

      <Row
        label="Default branch view"
        hint="Coming in Phase 2 — uses the dashboard's branch picker today."
      >
        <span
          className="pf-mono"
          style={{ fontSize: 11, color: PF_TINTS.inkDim }}
        >
          all branches
        </span>
      </Row>

      <Row
        label="Time zone"
        hint="Coming in Phase 2 — currently uses your browser's local zone."
      >
        <span
          className="pf-mono"
          style={{ fontSize: 11, color: PF_TINTS.inkDim }}
        >
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </span>
      </Row>

      {!isOperator && (
        <Row
          label="More options"
          hint="Lead-cost visibility is operator-controlled. If your email should be in the operator allowlist, contact Kyle."
        >
          <span
            className="pf-mono"
            style={{ fontSize: 11, color: PF_TINTS.inkDim }}
          >
            customer view
          </span>
        </Row>
      )}

      {/* Tiny audit hint of what would happen on Save */}
      {dirty && (
        <div
          style={{
            padding: '10px 18px',
            borderTop: `1px solid ${PF_TINTS.ruleHair}`,
            font: `500 10px ${PF_TINTS.mono}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#9d35ff',
          }}
        >
          unsaved changes · save to apply
        </div>
      )}

      {/* Reference defaults — collapsed footer to remind operators what
          ships out of the box. Hidden when defaults match the draft. */}
      {dirty && JSON.stringify(draft) !== JSON.stringify(DEFAULT_SETTINGS) && (
        <div
          style={{
            padding: '8px 18px 12px',
            font: `400 10px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.04em',
          }}
        >
          defaults: showLeadCost=off, sort=score, range=7d, cross-poll=off
        </div>
      )}
    </Card>
  );
}
