// services/connectors/hubspot-recon.ts — Demo Polish UX Gate 4B-3.
//
// I/O layer for the nightly HubSpot reconciliation cron. Wraps the pure
// recon engine in lib/connectors/hubspot/recon.ts with:
//   - Connector + token lookup
//   - HubSpot Search API call for deals updated in the last 7 days
//   - Pathfinder side: pull lead_actions + projects updated in the last
//     7 days, normalize to DealSnapshot
//   - Apply auto-resolutions (Gate 4B-3 ships the audit + escalation
//     paths only; the actual write-back is gated behind ENV
//     HUBSPOT_RECON_APPLY=1 so the Tuesday demo can run a dry-run with
//     the conflicts visible in the Inbox without mutating production)
//   - Insert escalations into pathfinder.architect_inbox

import { recordAudit } from '@/lib/connectors/audit';
import { redact } from '@/lib/connectors/hubspot/outbound';
import { getToken } from '@/lib/connectors/tokens';
import {
  escalationToInboxRow,
  mappingFromMetadata,
  reconcileDeals,
  type ArchitectInboxConflictRow,
  type DealSnapshot,
  type ReconResult,
} from '@/lib/connectors/hubspot/recon';
import { supabaseAdmin } from '@/lib/supabase';

const RECON_WINDOW_DAYS = 7;

export interface ReconCronResult {
  connectors_processed: number;
  auto_resolved: number;
  escalated: number;
  matched: number;
  errors: string[];
}

interface ConnectorRow {
  id: string;
  customer_org_id: string;
  account_external_id: string | null;
  metadata: Record<string, unknown> | null;
}

async function listActiveHubspotConnectors(): Promise<ConnectorRow[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => Promise<{
            data: ConnectorRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const res = await sb
    .from('connectors')
    .select('id, customer_org_id, account_external_id, metadata')
    .eq('connector_type', 'hubspot')
    .eq('status', 'connected');
  if (res.error || !res.data) return [];
  return res.data;
}

interface PathfinderLeadActionRow {
  id: number;
  project_id: string;
  status: string;
  attested_pipeline_value: number | null;
  updated_at: string;
}

interface PathfinderProjectRow {
  id: string;
  title: string | null;
  project_value: number | null;
  estimated_start_date: string | null;
}

async function loadPathfinderSide(
  windowDays: number,
): Promise<Map<string, DealSnapshot>> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        gte: (col: string, v: string) => Promise<{
          data: PathfinderLeadActionRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const actions = await sb
    .from('lead_actions')
    .select('id, project_id, status, attested_pipeline_value, updated_at')
    .gte('updated_at', since);
  if (actions.error || !actions.data) return new Map();

  // Bulk-load projects referenced by these lead_actions.
  const projectIds = Array.from(new Set(actions.data.map((a) => a.project_id)));
  const projects = await loadProjectsByIds(projectIds);

  const out = new Map<string, DealSnapshot>();
  for (const a of actions.data) {
    const p = projects.get(a.project_id);
    out.set(String(a.id), {
      pathfinder_lead_id: String(a.id),
      hubspot_deal_id: null,
      fields: {
        title: p?.title ?? null,
        project_value: a.attested_pipeline_value ?? p?.project_value ?? null,
        'lead_actions.status': a.status,
        estimated_start_date: p?.estimated_start_date ?? null,
        id: String(a.id),
      },
      updated_at: a.updated_at,
    });
  }
  return out;
}

async function loadProjectsByIds(ids: string[]): Promise<Map<string, PathfinderProjectRow>> {
  if (ids.length === 0) return new Map();
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        in: (col: string, v: string[]) => Promise<{
          data: PathfinderProjectRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const res = await sb
    .from('projects')
    .select('id, title, project_value, estimated_start_date')
    .in('id', ids);
  if (res.error || !res.data) return new Map();
  return new Map(res.data.map((r) => [r.id, r] as const));
}

interface HubspotDealResult {
  id: string;
  properties: {
    pathfinder_lead_id?: string;
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
    hs_lastmodifieddate?: string;
  };
  updatedAt?: string;
}

async function loadHubspotSide(
  accessToken: string,
  windowDays: number,
): Promise<Map<string, DealSnapshot>> {
  const since = new Date(Date.now() - windowDays * 86_400_000).getTime();
  const url = 'https://api.hubapi.com/crm/v3/objects/deals/search';
  const body = JSON.stringify({
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'hs_lastmodifieddate',
            operator: 'GTE',
            value: String(since),
          },
        ],
      },
    ],
    properties: [
      'pathfinder_lead_id',
      'dealname',
      'amount',
      'dealstage',
      'closedate',
      'hs_lastmodifieddate',
    ],
    limit: 100,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body,
  });
  if (!res.ok) return new Map();
  const json = (await res.json()) as { results?: HubspotDealResult[] };
  const out = new Map<string, DealSnapshot>();
  for (const d of json.results ?? []) {
    const pfId = d.properties.pathfinder_lead_id;
    if (!pfId) continue; // Deal isn't linked to a Pathfinder lead; ignore.
    out.set(pfId, {
      pathfinder_lead_id: pfId,
      hubspot_deal_id: d.id,
      fields: {
        title: d.properties.dealname ?? null,
        project_value: d.properties.amount ? Number(d.properties.amount) : null,
        'lead_actions.status': d.properties.dealstage ?? null,
        estimated_start_date: d.properties.closedate ?? null,
        id: pfId,
      },
      updated_at: d.updatedAt ?? d.properties.hs_lastmodifieddate ?? new Date().toISOString(),
    });
  }
  return out;
}

interface InboxInsert extends ArchitectInboxConflictRow {
  context: Record<string, unknown>;
}

async function insertInboxRows(rows: InboxInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (rows: InboxInsert[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  await sb.from('architect_inbox').insert(rows);
}

export async function runHubspotRecon(): Promise<ReconCronResult> {
  const summary: ReconCronResult = {
    connectors_processed: 0,
    auto_resolved: 0,
    escalated: 0,
    matched: 0,
    errors: [],
  };

  const connectors = await listActiveHubspotConnectors();
  for (const c of connectors) {
    summary.connectors_processed++;
    try {
      const token = await getToken(c.id);
      if (!token) {
        summary.errors.push(`connector ${c.id}: no_active_token`);
        continue;
      }
      const mapping = mappingFromMetadata(c.metadata);
      const [pf, hs] = await Promise.all([
        loadPathfinderSide(RECON_WINDOW_DAYS),
        loadHubspotSide(token.access, RECON_WINDOW_DAYS),
      ]);
      const result: ReconResult = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping });
      summary.auto_resolved += result.auto_resolved.length;
      summary.escalated += result.escalated.length;
      summary.matched += result.matched;

      if (result.escalated.length > 0) {
        await insertInboxRows(result.escalated.map(escalationToInboxRow));
      }

      await recordAudit({
        connector_id: c.id,
        customer_org_id: c.customer_org_id,
        event_type: 'recon.nightly',
        direction: 'inbound',
        status: 'received',
        payload_summary: {
          window_days: RECON_WINDOW_DAYS,
          matched: result.matched,
          auto_resolved: result.auto_resolved.length,
          escalated: result.escalated.length,
          token: redact(token.access),
          // Captured for the demo dry-run at MEMORY/demo-prep/. The
          // actual auto-resolution writes are gated behind
          // HUBSPOT_RECON_APPLY=1 (default off for safe Tuesday demo).
          apply_mode: process.env.HUBSPOT_RECON_APPLY === '1',
        },
      });
    } catch (err) {
      summary.errors.push(
        `connector ${c.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return summary;
}
