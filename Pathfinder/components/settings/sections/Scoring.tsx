'use client';

import { Card, Phase2Banner, Row } from '../Field';
import { PF_TINTS } from '@/lib/agent-tints';

const HI_THRESHOLD = 80;
const DEFAULT_COVERAGE_MILES = 300;
const SCORE_TOLERANCE = 15;

export function ScoringSection() {
  return (
    <>
      <Card
        title="Scoring and thresholds"
        description="Constants that drive the Ranker's score formula and the Verifier's tolerance. Read-only here — edits land in lib/scoring.ts and require a deploy."
      >
        <Row
          label="High-priority score threshold"
          hint="Minimum composite score to flag a project as high-priority. Drives the amber high-pri tier on map pins + the project list."
        >
          <ConstChip value={`${HI_THRESHOLD}`} />
        </Row>
        <Row
          label="Default branch coverage radius"
          hint="Applied to new branches at creation time. Ranker geo decay starts at 50mi from a branch and falls to 0 at this radius."
        >
          <ConstChip value={`${DEFAULT_COVERAGE_MILES}mi`} />
        </Row>
        <Row
          label="Verifier score tolerance"
          hint="Verifier passes the score-sensibility check when |ranker_score − recomputed_score| ≤ this value."
        >
          <ConstChip value={`±${SCORE_TOLERANCE}`} />
        </Row>
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

function ConstChip({ value }: { value: string }) {
  return (
    <span
      className="pf-mono"
      style={{
        fontSize: 11,
        color: PF_TINTS.mapInk,
        padding: '4px 10px',
        background: 'rgba(0,0,0,0.30)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 3,
      }}
    >
      {value}
    </span>
  );
}
