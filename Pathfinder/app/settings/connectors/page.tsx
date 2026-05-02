// /pathfinder/settings/connectors — Phase 0 Tuesday-demo stub.
//
// Server-rendered shell. Slack reports "Connected" via the existing
// SLACK_WEBHOOK_URL env signal (no schema, no OAuth — Phase 1 wires the
// real connector framework). Teams + HubSpot show Disconnected with a
// "Coming next phase" modal.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md §§ 3.3 + 4.4.

import type { Metadata } from 'next';

import { ConnectorsView } from '@/components/settings/connectors/ConnectorsView';
import type { ConnectorTileState } from '@/components/settings/connectors/ConnectorTile';

export const metadata: Metadata = {
  title: 'Pathfinder · Connectors',
  description: 'Connect Pathfinder to Slack, Microsoft Teams, and HubSpot.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type TileSeed = {
  id: 'slack' | 'teams' | 'hubspot';
  name: string;
  oneLiner: string;
  state: ConnectorTileState;
  accountName?: string;
  stat?: string;
  comingPhase?: string;
};

function buildTiles(): TileSeed[] {
  // Phase 0: Slack is "Connected" if the webhook signal exists in the
  // environment. The real connector record lands in Phase 1; for the
  // Tuesday demo we use the webhook env presence as a stand-in.
  const slackConnected = Boolean(process.env.SLACK_WEBHOOK_URL);

  return [
    {
      id: 'slack',
      name: 'Slack',
      oneLiner: 'Get alerts and chat with Pathfinder in your Slack workspace.',
      state: slackConnected ? 'connected' : 'disconnected',
      accountName: slackConnected ? 'Webhook (Phase 0 stub)' : undefined,
      stat: slackConnected ? '1 webhook routing alerts' : undefined,
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      oneLiner: 'Bring leads, outreach drafts, and feedback into Teams channels and DMs.',
      state: 'disconnected',
      comingPhase: 'Phase 2',
    },
    {
      id: 'hubspot',
      name: 'HubSpot CRM',
      oneLiner: 'Two-way sync of deals, contacts, and pipeline stages.',
      state: 'disconnected',
      comingPhase: 'Phase 3',
    },
  ];
}

export default function ConnectorsPage() {
  const tiles = buildTiles();
  return <ConnectorsView tiles={tiles} />;
}
