'use client';

import { Card, Phase2Banner, Row } from '../Field';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

export function NotificationsSection() {
  return (
    <>
      <Card
        title="Email recipients"
        description="Who receives the org-level Friday brief, per-branch briefs, and critical alerts. Recipients ship hard-coded to the Briefing agent for the pilot; this UI surfaces them so you can see what's wired."
      >
        <Row label="Org-level Friday brief" hint="Kyle Doenz + Zedcor exec team">
          <span className="pf-mono" style={{ fontSize: 11, color: PF_TINTS.mapInkDim }}>
            kyle@demystified.ai
          </span>
        </Row>
        <Row label="Per-branch Friday brief" hint="Branch managers — one digest per branch they own.">
          <span className="pf-mono" style={{ fontSize: 11, color: PF_TINTS.mapInkDim }}>
            branch_managers
          </span>
        </Row>
        <Row label="Critical alerts" hint="Operations leads — score ≥ 90 + tight RFP window.">
          <span className="pf-mono" style={{ fontSize: 11, color: PF_TINTS.mapInkDim }}>
            ops_lead
          </span>
        </Row>
        <Phase2Banner note="Editing recipients requires per-user roles, which ship in Phase 2. Until then, change values in lib/notifications config." />
      </Card>

      <Card
        title="Slack channel routing"
        description="Briefing agent posts the weekly digest to the channel below; the critical-alert channel routes high-priority hits."
      >
        <Row
          label="Default channel"
          hint={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>Briefing weekly digest goes here.</span>
              <a
                href={`https://unicronsystems.slack.com/archives/${'C0B07HEK6M9'}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#9d35ff' }}
              >
                open in Slack
              </a>
            </span>
          }
        >
          <span
            className="pf-mono"
            style={{
              fontSize: 11,
              color: PF_TINTS.mapInk,
              padding: '4px 8px',
              background: hexAlpha('#000000', 0.30),
              borderRadius: 3,
            }}
          >
            #unicronsystems
          </span>
        </Row>
        <Phase2Banner note="Per-branch routing (#pathfinder-{branch-code}) ships with the Zedcor production rollout." />
      </Card>

      <Card title="Email frequency + quiet hours">
        <Phase2Banner note="Daily / Weekly / Monthly digest selection and quiet-hour suppression ship in Phase 2." />
      </Card>
    </>
  );
}
