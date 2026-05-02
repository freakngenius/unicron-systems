// /pathfinder/onboarding/connectors — C-4A customer onboarding wizard.
//
// Server component shell — reads connector status for the current org
// from `pathfinder.connectors` (via lib/connectors/queries) and hands a
// pre-seeded list to the client wizard. Tokens never cross the
// server→client boundary; only `state` (connected | disconnected | etc)
// + display copy.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3.

import type { Metadata } from 'next';

import { DEFAULT_ORG_ID } from '@/lib/connectors/auth';
import { listConnectors, type ConnectorListItem } from '@/lib/connectors/queries';
import type { ConnectorTileState } from '@/components/settings/connectors/ConnectorTile';
import type { ConnectorType } from '@/lib/types';
import { Wizard, type WizardConnectorSeed } from '@/components/onboarding/Wizard';

export const metadata: Metadata = {
  title: 'Pathfinder · Welcome',
  description: 'Wire Pathfinder into the tools your team already uses.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * `comingSoon` flags — a Teams/HubSpot OAuth route may not be merged
 * yet (C-2A / C-3A run concurrently with this branch). We resolve the
 * authoritative state at runtime via the `pathfinder.connectors` row:
 * if the row's `state === 'disconnected'` and the env vars for that
 * provider are absent, we treat it as Coming-soon. Slack always renders
 * the live OAuth path because C-1B already shipped.
 */
function resolveComingSoon(type: ConnectorType): boolean {
  if (type === 'slack') return false;
  if (type === 'teams') {
    return !process.env.TEAMS_APP_ID || !process.env.TEAMS_CLIENT_SECRET;
  }
  if (type === 'hubspot') {
    return !process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET;
  }
  return false;
}

const NAMES: Record<ConnectorType, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  hubspot: 'HubSpot',
};

const WHAT_IT_DOES: Record<ConnectorType, string[]> = {
  slack: [
    'Real-time alerts on verified leads (score ≥ 90)',
    'Daily and weekly briefs posted to a channel of your choice',
    'Slash commands and DMs route to the chat agent',
    '👍 / 👎 reactions feed the ranker',
  ],
  teams: [
    'Adaptive Card alerts on verified leads',
    'Daily and weekly briefs in the Teams channels you pick',
    '@-mention the bot for natural-language Q&A',
    'Action-button feedback feeds the ranker',
  ],
  hubspot: [
    'Verified leads pushed into HubSpot deals automatically',
    'Pipeline stage changes synced back into Pathfinder',
    'Field + stage mapping configurable per pilot',
    'Conflict resolution policy is operator-controlled',
  ],
};

function buildSeeds(items: ConnectorListItem[], orgId: string): WizardConnectorSeed[] {
  const byType = new Map(items.map((i) => [i.type, i] as const));
  const order: ConnectorType[] = ['slack', 'teams', 'hubspot'];
  return order.map((type) => {
    const item = byType.get(type);
    const state: ConnectorTileState = item?.row?.status ?? 'disconnected';
    const comingSoon = resolveComingSoon(type) && state !== 'connected';
    const authStartHref = `/pathfinder/api/connectors/${type}/auth?org_id=${encodeURIComponent(orgId)}`;
    return {
      type,
      name: NAMES[type],
      state,
      authStartHref,
      comingSoon,
      whatItDoes: WHAT_IT_DOES[type],
    };
  });
}

export default async function OnboardingConnectorsPage() {
  // v1: pin to DEFAULT_ORG_ID. Multi-tenant comes when the auth surface
  // ships a real session with org claims. The page sits behind the same
  // basic-auth wall as the rest of /pathfinder.
  const items = await listConnectors(DEFAULT_ORG_ID).catch(() => []);
  const connectors = buildSeeds(items, DEFAULT_ORG_ID);
  return <Wizard orgId={DEFAULT_ORG_ID} connectors={connectors} />;
}
