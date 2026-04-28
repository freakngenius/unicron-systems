'use client';

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { Button, Card, Phase2Banner, Row, Toggle } from '../Field';
import {
  PathfinderSettings,
  updateSettings,
  useIsOperator,
  useSettings,
} from '@/lib/settings';

export function AdvancedSection() {
  const isOperator = useIsOperator();
  const persisted = useSettings();
  const [draft, setDraft] = React.useState<PathfinderSettings>(persisted);
  React.useEffect(() => setDraft(persisted), [persisted]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(persisted);

  if (!isOperator) {
    return (
      <Card
        title="Advanced"
        description="Operator-only surfaces. Sign in with an email in the OPERATOR_EMAILS allowlist (top-right of this page) to access these toggles."
      >
        <div
          style={{
            padding: '14px 18px',
            font: `400 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkDim,
          }}
        >
          customer view — advanced toggles are hidden
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        title="Advanced"
        description="Operator-only feature toggles. Operations view broadens the lead-cost gate to cover Pulse confidence intervals, Verifier escalation queue depth, dead-letter queues, and similar internal surfaces."
        footer={
          <>
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(persisted)}>
              Reset
            </Button>
            <Button disabled={!dirty} onClick={() => updateSettings(draft)}>
              Save advanced preferences
            </Button>
          </>
        }
      >
        <Row
          label={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Operations view
              <OperatorChip />
            </span>
          }
          hint="When on, expose Pulse confidence intervals, Verifier escalation queue depth, dead-letter queues for failed agent cycles, and similar internal surfaces."
        >
          <Toggle
            checked={draft.operationsView}
            onChange={(next) => setDraft({ ...draft, operationsView: next })}
            label="Operations view"
          />
        </Row>
        <Row
          label={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Demo mode
              <OperatorChip />
            </span>
          }
          hint="Visually marks the dashboard as a demo (banner + 'synthetic data' indicators) so customer demos can't be mistaken for production state."
        >
          <Toggle
            checked={draft.demoMode}
            onChange={(next) => setDraft({ ...draft, demoMode: next })}
            label="Demo mode"
          />
        </Row>
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
      </Card>

      <Card title="Debug mode">
        <Phase2Banner note="Verbose agent logging, longer event_data payloads in agent_log, performance traces. Phase 2." />
      </Card>
    </>
  );
}

function OperatorChip() {
  return (
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
  );
}
