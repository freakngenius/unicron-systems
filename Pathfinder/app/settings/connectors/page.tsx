// /pathfinder/settings/connectors — Phase 1 connector framework UI.
//
// Server-rendered shell. Reads pathfinder.connectors rows for the
// current customer org (v1: hardcoded 'zedcor' until multi-tenant
// shipping). Client wrapper handles routing-rules editing, disconnect
// confirmation, and the (still-stubbed) Teams + HubSpot tiles whose
// connectors aren't wired in Phase 1.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md §§ 3.3 + 3.6 + 4.4.

import type { Metadata } from 'next';

import { DEFAULT_ORG_ID } from '@/lib/connectors/auth';
import { listConnectors, type ConnectorListItem } from '@/lib/connectors/queries';
import { ConnectorsView } from '@/components/settings/connectors/ConnectorsView';
import type { ConnectorTileState } from '@/components/settings/connectors/ConnectorTile';
import { HubspotUserTile } from '@/components/settings/connectors/HubspotUserTile';

export const metadata: Metadata = {
  title: 'Pathfinder · Connectors',
  description: 'Connect Pathfinder to Slack, Microsoft Teams, and HubSpot.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface ConnectorTileSeed {
  id: 'slack' | 'teams' | 'hubspot';
  name: string;
  oneLiner: string;
  state: ConnectorTileState;
  accountName?: string;
  stat?: string;
  errorMessage?: string;
  connectorId?: string;
  comingPhase?: string;
  authStartHref?: string;
  /** When true the tile uses the Phase 0 "coming soon" modal rather than
   *  the live OAuth flow. Teams + HubSpot are stubbed in Phase 1. */
  stubModal?: boolean;
  /** Phase tag for the stub modal (Teams=Phase 2, HubSpot=Phase 3). */
  stubPhase?: string;
}

const ONE_LINERS: Record<ConnectorTileSeed['id'], string> = {
  slack: 'Get alerts and chat with Pathfinder in your Slack workspace.',
  teams: 'Bring leads, outreach drafts, and feedback into Teams channels and DMs.',
  hubspot: 'Two-way sync of deals, contacts, and pipeline stages.',
};

const NAMES: Record<ConnectorTileSeed['id'], string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  hubspot: 'HubSpot CRM',
};

function deriveStat(item: ConnectorListItem): string | undefined {
  if (item.status !== 'connected') return undefined;
  const ruleCount = item.routingRuleCount;
  const activity = item.recentActivityCount;
  if (ruleCount > 0 && activity > 0) {
    return `${ruleCount} rule${ruleCount === 1 ? '' : 's'} · ${activity} event${activity === 1 ? '' : 's'} (7d)`;
  }
  if (ruleCount > 0) return `${ruleCount} routing rule${ruleCount === 1 ? '' : 's'}`;
  if (activity > 0) return `${activity} event${activity === 1 ? '' : 's'} (7d)`;
  return 'Connected · no rules yet';
}

function buildTiles(items: ConnectorListItem[]): ConnectorTileSeed[] {
  const byType = new Map(items.map((i) => [i.type, i] as const));
  const slackItem = byType.get('slack');
  const teamsItem = byType.get('teams');
  const hubspotItem = byType.get('hubspot');

  // Slack: real OAuth-backed tile when a row exists, otherwise show
  // the disconnected state with the auth-start link. The webhook env
  // signal is no longer the source of truth — the connector row is.
  // The legacy SLACK_WEBHOOK_URL surfaces as an auxiliary stat for
  // backwards compatibility while Phase 0 → Phase 1 migration runs.
  const slackHasRow = Boolean(slackItem?.row);
  const slackLegacyWebhook = !slackHasRow && Boolean(process.env.SLACK_WEBHOOK_URL);
  const slack: ConnectorTileSeed = {
    id: 'slack',
    name: NAMES.slack,
    oneLiner: ONE_LINERS.slack,
    state: slackHasRow ? slackItem!.status : slackLegacyWebhook ? 'connected' : 'disconnected',
    accountName: slackHasRow
      ? slackItem!.row?.account_name ?? undefined
      : slackLegacyWebhook
        ? 'Webhook (Phase 0 stub)'
        : undefined,
    stat: slackHasRow
      ? deriveStat(slackItem!)
      : slackLegacyWebhook
        ? '1 webhook routing alerts'
        : undefined,
    errorMessage: slackHasRow ? slackItem!.row?.last_error ?? undefined : undefined,
    connectorId: slackItem?.row?.id,
    authStartHref: `/pathfinder/api/connectors/slack/auth?org_id=${encodeURIComponent(DEFAULT_ORG_ID)}`,
  };

  // Teams + HubSpot stay on the "coming soon" modal in Phase 1 — the
  // OAuth handshakes for those connectors don't exist yet. We still
  // surface a row's status if the framework ever inserts one (e.g., via
  // the operator's manual seed during Phase 2/3 testing).
  const teams: ConnectorTileSeed = {
    id: 'teams',
    name: NAMES.teams,
    oneLiner: ONE_LINERS.teams,
    state: teamsItem?.row?.status ?? 'disconnected',
    accountName: teamsItem?.row?.account_name ?? undefined,
    stat: teamsItem?.row ? deriveStat(teamsItem) : undefined,
    connectorId: teamsItem?.row?.id,
    stubModal: !teamsItem?.row,
    stubPhase: 'Phase 2',
  };

  const hubspot: ConnectorTileSeed = {
    id: 'hubspot',
    name: NAMES.hubspot,
    oneLiner: ONE_LINERS.hubspot,
    state: hubspotItem?.row?.status ?? 'disconnected',
    accountName: hubspotItem?.row?.account_name ?? undefined,
    stat: hubspotItem?.row ? deriveStat(hubspotItem) : undefined,
    connectorId: hubspotItem?.row?.id,
    stubModal: !hubspotItem?.row,
    stubPhase: 'Phase 3',
  };

  return [slack, teams, hubspot];
}

export default async function ConnectorsPage() {
  // v1: pin to DEFAULT_ORG_ID. Multi-tenant comes when the auth
  // surface ships a real session with org claims. The page itself is
  // already behind basic-auth + the operator gate is layered on the
  // mutation API routes.
  const items = await listConnectors(DEFAULT_ORG_ID).catch(() => []);
  const tiles = buildTiles(items);

  // Gate 10B: HubSpot moves to a per-user tile reading from
  // pathfinder.user_connections instead of pathfinder.connectors.
  // The tile self-hydrates client-side via /api/connectors/hubspot/status
  // (the operator email lives in localStorage; not in this server render's
  // headers). Initial state stays disconnected until the client fetch lands.
  const hubspotUserTile = (
    <HubspotUserTile state="disconnected" operatorEmail={null} />
  );

  return (
    <ConnectorsView
      tiles={tiles}
      orgId={DEFAULT_ORG_ID}
      tileOverrides={{ hubspot: hubspotUserTile }}
    />
  );
}
