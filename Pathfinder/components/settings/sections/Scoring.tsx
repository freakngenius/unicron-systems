'use client';

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { Button, Card, Phase2Banner, Row } from '../Field';
import {
  DEFAULT_SCORING_CONFIG,
  ScoringConfig,
  saveScoringConfig,
  useScoringConfig,
} from '@/lib/scoring-config';

export function ScoringSection() {
  const persisted = useScoringConfig();
  const [draft, setDraft] = React.useState<ScoringConfig>(persisted);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDraft(persisted);
  }, [persisted]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(persisted);

  const onConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveScoringConfig(draft);
      setDraft(saved);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    setDraft(persisted);
    setError(null);
  };

  return (
    <>
      <Card
        title="Scoring and thresholds"
        description="Persistent constants the Ranker, Verifier, and dashboard read at runtime. Editing is live — confirming a change flips the product behavior on the next render (dashboard) and the next cycle (Verifier)."
        footer={
          <>
            <Button variant="ghost" disabled={!dirty || saving} onClick={onReset}>
              Reset
            </Button>
            <Button onClick={onConfirm} disabled={!dirty || saving}>
              {saving ? 'Confirming…' : 'Confirm changes'}
            </Button>
          </>
        }
      >
        <Row
          label="High-priority score threshold"
          hint="Minimum composite score (0–100) to flag a project as high-priority. Drives the amber high-pri tier on map pins, the project list, and the New · 24h count in the top bar."
        >
          <NumInput
            value={draft.high_priority_threshold}
            min={0}
            max={100}
            suffix=""
            onChange={(n) => setDraft({ ...draft, high_priority_threshold: n })}
          />
        </Row>
        <Row
          label="Verifier score tolerance"
          hint="Verifier passes the score-sensibility check when |ranker_score − recomputed_score| ≤ this value. Read at the start of each Verifier cycle."
        >
          <NumInput
            value={draft.score_tolerance}
            min={0}
            max={100}
            suffix=""
            onChange={(n) => setDraft({ ...draft, score_tolerance: n })}
          />
        </Row>
        <Row
          label="Default branch coverage radius"
          hint="Applied to new branches at creation time. Existing branch radii are unchanged — edit those in Branches and customers (Phase 2)."
        >
          <NumInput
            value={draft.default_coverage_miles}
            min={10}
            max={5000}
            suffix="mi"
            onChange={(n) => setDraft({ ...draft, default_coverage_miles: n })}
          />
        </Row>

        {error && (
          <div
            style={{
              padding: '10px 18px',
              borderTop: `1px solid ${PF_TINTS.ruleHair}`,
              font: `500 11px ${PF_TINTS.mono}`,
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}

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
            unsaved changes · confirm to write to ranking_config
          </div>
        )}

        {!dirty && savedAt && (
          <div
            style={{
              padding: '10px 18px',
              borderTop: `1px solid ${PF_TINTS.ruleHair}`,
              font: `500 10px ${PF_TINTS.mono}`,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: PF_TINTS.runningGreen,
            }}
          >
            ✓ saved · ranking_config row appended
          </div>
        )}

        <div
          style={{
            padding: '8px 18px 12px',
            font: `400 10px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.04em',
          }}
        >
          defaults: hi-priority {DEFAULT_SCORING_CONFIG.high_priority_threshold} · tolerance ±
          {DEFAULT_SCORING_CONFIG.score_tolerance} · coverage{' '}
          {DEFAULT_SCORING_CONFIG.default_coverage_miles}mi
        </div>
      </Card>

      <Card title="Pulse auto-apply tuning">
        <Phase2Banner note="Confidence threshold at which Pulse-proposed weight changes auto-apply without human approval. Default: never. Wires up when Pulse ships in Layer 2." />
      </Card>

      <Card title="Verification queue threshold">
        <Phase2Banner note="Skip verification entirely for projects below this score. Phase 2 — currently every ranked project enters the Verifier queue." />
      </Card>
    </>
  );
}

function NumInput({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={{
          background: PF_TINTS.bg,
          color: PF_TINTS.ink,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: 3,
          padding: '5px 10px',
          font: `500 12px ${PF_TINTS.mono}`,
          width: 76,
          textAlign: 'right',
          outline: 'none',
        }}
      />
      {suffix && (
        <span
          className="pf-mono"
          style={{ fontSize: 10, color: PF_TINTS.inkDim, letterSpacing: '0.04em' }}
        >
          {suffix}
        </span>
      )}
    </span>
  );
}
