'use client';

import * as React from 'react';

import { Card, Phase2Banner, Row, Toggle } from '../Field';
import { SOURCES } from '@/lib/sources';
import { PF_TINTS } from '@/lib/agent-tints';

export function SourcesSection() {
  // Source enablement is currently configured inside the Ingestor's
  // Perplexity Space prompt — flipping a toggle here doesn't actually
  // disable the source. Surfaces the canonical taxonomy from
  // lib/sources.ts and stages the UI for Phase 2 wiring.
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(
    Object.fromEntries(SOURCES.map((s) => [s.code, true])),
  );

  return (
    <>
      <Card
        title="Sources"
        description="Public data sources the Ingestor polls. Toggling on/off here is a Phase 2 wiring — the source enablement currently lives inside the Ingestor's Perplexity Space configuration."
      >
        {SOURCES.map((s) => (
          <Row key={s.code} label={s.label} hint={s.description}>
            <Toggle
              checked={enabled[s.code] ?? true}
              onChange={(next) => setEnabled({ ...enabled, [s.code]: next })}
              label={`${s.label} enabled`}
            />
          </Row>
        ))}
        <div
          style={{
            padding: '10px 18px',
            font: `400 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.mapInkDim,
            letterSpacing: '0.04em',
          }}
        >
          toggling here is local-only until the Phase 2 sync lands
        </div>
      </Card>

      <Card title="Source weight + geographic coverage">
        <Phase2Banner note="Per-source Ranker weight and per-state/metro filtering ship in Phase 2." />
      </Card>
    </>
  );
}
